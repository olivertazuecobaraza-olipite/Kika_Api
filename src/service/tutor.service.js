// src/service/tutor.service.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { openai } from '../config/openai.js';
import { qdrant } from '../config/qdrant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INSTRUCTIONS_PATH = path.resolve(__dirname, '../../instrucciones.agente.txt');

const collectionCache = new Map();
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const CACHE_MAX_COLLECTIONS = Number(process.env.CACHE_MAX_COLLECTIONS || 20);
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || 18000);
const VECTOR_LIMIT = Number(process.env.QDRANT_VECTOR_LIMIT || 3);
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const QDRANT_COLLECTION_ERROR_MESSAGE = 'La coleccion de Qdrant indicada no existe o no esta disponible.';

const isMissingQdrantCollectionError = (err) => {
    const status = err?.status || err?.statusCode || err?.response?.status;
    const message = [
        err?.message,
        err?.data?.status?.error,
        err?.response?.data?.status?.error,
        err?.response?.data?.message
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return status === 404
        || message.includes('not found')
        || message.includes('doesn\'t exist')
        || message.includes('does not exist')
        || message.includes('collection')
            && (
                message.includes('not exists')
                || message.includes('not found')
                || message.includes('doesn')
            );
};

const createQdrantCollectionError = (vsIdQdrant, cause) => {
    const error = new Error(QDRANT_COLLECTION_ERROR_MESSAGE);
    error.name = 'QdrantCollectionError';
    error.status = 400;
    error.publicMessage = QDRANT_COLLECTION_ERROR_MESSAGE;
    error.vsIdQdrant = vsIdQdrant;
    error.cause = cause;
    return error;
};

const searchQdrantCollection = async (vsIdQdrant, options) => {
    try {
        return await qdrant.search(vsIdQdrant, options);
    } catch (err) {
        if (isMissingQdrantCollectionError(err)) {
            throw createQdrantCollectionError(vsIdQdrant, err);
        }
        throw err;
    }
};

const normalizeHistory = (history) => {
    if (!Array.isArray(history)) return [];

    return history
        .filter(message => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
        .map(message => ({
            role: message.role,
            content: message.content
        }));
};

const isRealHeading = (title, num) => {
    const titleLower = title.toLowerCase();
    if (/\bse\s+[a-z\u00f1\u00e1\u00e9\u00ed\u00f3\u00fa]+/i.test(titleLower)) return false;

    const actionVerbs = /^(?:define|definir|explica|explicar|compara|comparar|identifica|identificar|justifica|justificar|mide|medir|calcula|calcular|revisa|revisar|prepara|preparar|analiza|analizar|realiza|realizar|organiza|organizar|reubica|reubicar|imparte|impartir|escribe|escribir|elabora|elaborar|diferencia|diferenciar|relaciona|relacionar)\b/i;
    if (actionVerbs.test(titleLower)) return false;

    const words = title.split(/\s+/).filter(Boolean);
    const isSingleLevel = !num.includes('.');
    return !(isSingleLevel && words.length > 7);
};

const pruneCache = () => {
    while (collectionCache.size > CACHE_MAX_COLLECTIONS) {
        const oldestKey = collectionCache.keys().next().value;
        collectionCache.delete(oldestKey);
    }
};

const getCollectionData = async (vsIdQdrant) => {
    const cached = collectionCache.get(vsIdQdrant);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    let offset = undefined;
    const allPoints = [];
    do {
        const response = await qdrant.scroll(vsIdQdrant, {
            limit: 100,
            with_payload: true,
            with_vector: false,
            offset
        });

        allPoints.push(...response.points);
        offset = response.next_page_offset;

        if (allPoints.length >= MAX_SCROLL_POINTS) {
            console.warn(`[TutorService] Limite de puntos alcanzado para ${vsIdQdrant}: ${MAX_SCROLL_POINTS}`);
            break;
        }
    } while (offset);

    const pages = [];
    allPoints.forEach(point => {
        const text = point.payload?.text || '';
        const fileName = point.payload?.file_name || '';
        const pageMatch = text.match(/<PARSED TEXT FOR PAGE:\s*(\d+)\s*\/\s*\d+>/);

        if (pageMatch) {
            pages.push({
                id: point.id,
                pageNum: parseInt(pageMatch[1], 10),
                fileName,
                text
            });
        }
    });

    pages.sort((a, b) => {
        if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName);
        return a.pageNum - b.pageNum;
    });

    const headingRegex = /(?:^|\n|\.\s+)(?:cap[\u00ed\u00edi]tulo\s+)?(\d+(?:\.\d+)*)\.?\s+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Za-z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\t ,:()"'\u201c\u201d\u2019&-]{3,60})/gi;
    const toc = [];
    pages.forEach(page => {
        let match;
        headingRegex.lastIndex = 0;
        while ((match = headingRegex.exec(page.text)) !== null) {
            const num = match[1];
            const title = match[2].trim();
            if (isRealHeading(title, num)) {
                toc.push({
                    num,
                    title,
                    page: page.pageNum,
                    file: page.fileName
                });
            }
        }
    });

    const data = { pages, toc };
    collectionCache.set(vsIdQdrant, { timestamp: now, data });
    pruneCache();

    return data;
};

const getExplicitContextPages = async ({ vsIdQdrant, prompt }) => {
    const pageMatch = prompt.match(/(?:p[a\u00e1]g(?:ina)?|pg\.?|p\.)\s*(\d+)\b/i);
    const sectionMatch = prompt.match(/(?:cap[\u00ed\u00edi]tulo|tema|punto|secci[o\u00f3]n|unidad|apartado|m[o\u00f3]dulo|bloque|parte)\s*(\d+(?:\.\d+)*)\b/i)
        || prompt.match(/\b(\d+\.\d+(?:\.\d+)*)\b/);

    if (!pageMatch && !sectionMatch) {
        return [];
    }

    const { pages, toc } = await getCollectionData(vsIdQdrant);

    if (pageMatch) {
        const pageNum = parseInt(pageMatch[1], 10);
        const pageStart = Math.max(1, pageNum - 1);
        const pageEnd = pageNum + 1;
        const explicitPages = pages.filter(page => page.pageNum >= pageStart && page.pageNum <= pageEnd);

        console.log(`[TutorService] Recuperacion exacta por pagina ${pageNum}. Rango: ${pageStart}-${pageEnd}. Encontradas: ${explicitPages.length} pag(s).`);
        return explicitPages;
    }

    const sectionNum = sectionMatch[1];
    let matchedHeadings = toc.filter(heading => heading.num === sectionNum);
    if (matchedHeadings.length === 0) {
        return [];
    }

    const indexHeading = matchedHeadings.find(heading => heading.page <= 15);
    if (indexHeading) {
        const referenceTitle = indexHeading.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const contentHeadings = matchedHeadings.filter(heading => {
            if (heading.page <= 15) return false;
            const headingTitle = heading.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            return headingTitle.includes(referenceTitle) || referenceTitle.includes(headingTitle);
        });

        if (contentHeadings.length > 0) {
            matchedHeadings = contentHeadings;
        }
    }

    matchedHeadings.sort((a, b) => a.page - b.page);
    const matchedHeading = matchedHeadings[matchedHeadings.length - 1];

    const sameFileHeadings = toc
        .filter(heading => heading.file === matchedHeading.file)
        .sort((a, b) => b.page - a.page);

    const uniqueHeadings = [];
    const seenNums = new Set();
    for (const heading of sameFileHeadings) {
        if (!seenNums.has(heading.num)) {
            seenNums.add(heading.num);
            uniqueHeadings.push(heading);
        }
    }
    uniqueHeadings.sort((a, b) => a.page - b.page);

    const currentIndex = uniqueHeadings.findIndex(heading => heading.num === matchedHeading.num);
    const pageStart = matchedHeading.page;
    let pageEnd = pageStart + 5;

    if (currentIndex !== -1 && currentIndex < uniqueHeadings.length - 1) {
        pageEnd = uniqueHeadings[currentIndex + 1].page;
    }

    const totalSpan = pageEnd - pageStart;
    const explicitPages = totalSpan <= 5
        ? pages.filter(page => page.fileName === matchedHeading.file && page.pageNum >= pageStart && page.pageNum <= pageEnd)
        : pages.filter(page => page.fileName === matchedHeading.file && page.pageNum >= pageStart && page.pageNum <= pageStart + 1);

    console.log(`[TutorService] Recuperacion exacta por seccion ${sectionNum}. Rango: ${pageStart}-${pageEnd}. Encontradas: ${explicitPages.length} pag(s).`);
    return explicitPages;
};

const buildContext = ({ explicitPages, searchResult }) => {
    const finalContexts = [];
    const addedKeys = new Set();
    let contextChars = 0;

    const addContext = (key, text) => {
        if (addedKeys.has(key) || !text) return;

        const remainingChars = MAX_CONTEXT_CHARS - contextChars;
        if (remainingChars <= 0) return;

        addedKeys.add(key);
        const clippedText = text.length > remainingChars ? text.slice(0, remainingChars) : text;
        contextChars += clippedText.length;
        finalContexts.push(clippedText);
    };

    explicitPages.forEach(page => {
        addContext(`${page.fileName}_${page.pageNum}`, page.text);
    });

    searchResult.forEach(hit => {
        const text = hit.payload?.text || '';
        const fileName = hit.payload?.file_name || '';
        const pageMatch = text.match(/<PARSED TEXT FOR PAGE:\s*(\d+)/);
        const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;
        const key = pageNum ? `${fileName}_${pageNum}` : hit.id;

        addContext(key, text);
    });

    return finalContexts.join('\n');
};

const getInstructions = async ({ curso, context }) => {
    let instructionsTemplate;

    try {
        instructionsTemplate = await fs.readFile(INSTRUCTIONS_PATH, 'utf8');
    } catch (err) {
        console.warn(`[TutorService] No se pudo leer el archivo de instrucciones en ${INSTRUCTIONS_PATH}. Usando fallback por defecto.`, err);
        instructionsTemplate = 'Eres un tutor experto para el curso {curso}. Responde basandote estrictamente en este contexto:\n\n{context}';
    }

    return instructionsTemplate
        .replace(/{curso}/g, curso)
        .replace(/{context}/g, context);
};

export const getTutorResponse = async ({ curso, vsIdQdrant, prompt, history = [] }) => {
    const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: prompt
    });
    const [{ embedding }] = embeddingResponse.data;

    const searchResult = await searchQdrantCollection(vsIdQdrant, {
        vector: embedding,
        limit: VECTOR_LIMIT
    });

    let explicitPages = [];
    try {
        explicitPages = await getExplicitContextPages({ vsIdQdrant, prompt });
    } catch (err) {
        console.error('[TutorService] Error al intentar recuperar contexto determinista:', err);
    }

    const context = buildContext({ explicitPages, searchResult });
    const systemInstruction = await getInstructions({ curso, context });
    const normalizedHistory = normalizeHistory(history);

    const chatCompletion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
            { role: 'system', content: systemInstruction },
            ...normalizedHistory,
            { role: 'user', content: prompt }
        ],
        temperature: 0.4
    });

    return chatCompletion.choices[0].message.content || 'No pude generar una respuesta.';
};
