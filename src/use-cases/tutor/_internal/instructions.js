import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGE_PROFILES } from './localization.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INSTRUCTIONS_PATH = path.resolve(__dirname, '../../../../instrucciones.agente.txt');
const INSTRUCTIONS_CACHE_TTL_MS = Number(process.env.INSTRUCTIONS_CACHE_TTL_MS || (
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? 1000 : 0
));

let cachedInstructionsTemplate = null;
let cachedInstructionsAt = 0;

export const clearInstructionsCache = () => {
    cachedInstructionsTemplate = null;
    cachedInstructionsAt = 0;
};

const readInstructionsTemplate = async () => {
    const now = Date.now();
    const cacheFresh = cachedInstructionsTemplate !== null
        && (INSTRUCTIONS_CACHE_TTL_MS === 0 || now - cachedInstructionsAt < INSTRUCTIONS_CACHE_TTL_MS);

    if (cacheFresh) {
        return cachedInstructionsTemplate;
    }

    try {
        cachedInstructionsTemplate = await fs.readFile(INSTRUCTIONS_PATH, 'utf8');
    } catch (err) {
        console.warn(`[TutorService] No se pudo leer el archivo de instrucciones en ${INSTRUCTIONS_PATH}. Usando fallback por defecto.`, err);
        cachedInstructionsTemplate = 'Eres un tutor experto para el curso {curso}. Responde basandote estrictamente en este contexto:\n\n{context}';
    }
    cachedInstructionsAt = now;

    return cachedInstructionsTemplate;
};

export const getInstructions = async ({ curso, context, responseLanguage = LANGUAGE_PROFILES.es }) => {
    const instructionsTemplate = await readInstructionsTemplate();

    const instructions = instructionsTemplate
        .replace(/{curso}/g, curso)
        .replace(/{context}/g, context);

    const languageRule = `

RESPONSE LANGUAGE

Reply in: ${responseLanguage.languageName}.
If the user mixes languages, keep this response language unless the user explicitly requests another language.
Always keep the response as valid HTML.`;

    const ragRule = context.includes('MEMORIA DOCUMENTAL DE LA COLECCION QDRANT')
        ? `

USO DEL CONTEXTO RECUPERADO

Usa el contexto recuperado como apoyo preferente cuando sea relevante para la pregunta.
Si el contexto es escaso o no contiene la respuesta exacta, responde de forma natural con la mejor ayuda posible y explica cualquier limite importante sin bloquear la conversacion.`
        : '';

    if (!context.includes('ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION')) {
        return `${instructions}${languageRule}${ragRule}`;
    }

    return `${instructions}${languageRule}${ragRule}

REGLA PRIORITARIA SOBRE ESTRUCTURA DE CURSO

Si el contexto incluye el bloque "ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION", usalo como apoyo preferente para responder preguntas sobre numero o listado de modulos, unidades formativas, practicas, manuales, contenidos, horas o estructura del curso.
Si el usuario pide una vision mas amplia, puedes complementar la respuesta de forma natural indicando cuando estas usando contexto del curso y cuando estas dando orientacion general.`;
};
export const getWebInstructions = async ({ curso, context, responseLanguage = LANGUAGE_PROFILES.es }) => {
    const instructions = await getInstructions({ curso, context, responseLanguage });
    return `${instructions}

BUSQUEDA EXTERNA ACTIVADA

Puedes complementar el contexto disponible con una busqueda en internet.
Indica cuando sea relevante que informacion procede de internet y cual procede del contexto del curso.
Responde exclusivamente con HTML valido, sin Markdown.
No anadas una seccion de fuentes: el sistema la incorporara automaticamente.`;
};
