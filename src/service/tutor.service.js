// src/service/tutor.service.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { openai } from '../config/openai.js';
import { perplexity } from '../config/perplexity.js';
import { qdrant } from '../config/qdrant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INSTRUCTIONS_PATH = path.resolve(__dirname, '../../instrucciones.agente.txt');

const collectionCache = new Map();
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const CACHE_MAX_COLLECTIONS = Number(process.env.CACHE_MAX_COLLECTIONS || 20);
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || 18000);
const COLLECTION_STRUCTURAL_CONTEXT_CHARS = Number(process.env.COLLECTION_STRUCTURAL_CONTEXT_CHARS || 4000);
const COLLECTION_SUMMARY_CONTEXT_CHARS = Number(process.env.COLLECTION_SUMMARY_CONTEXT_CHARS || 1500);
const RAG_MIN_CONTEXT_CHARS = Number(process.env.RAG_MIN_CONTEXT_CHARS || 500);
const RAG_MIN_VECTOR_SCORE = Number(process.env.RAG_MIN_VECTOR_SCORE || 0.68);
const LEXICAL_LIMIT = Number(process.env.QDRANT_LEXICAL_LIMIT || 6);
const VECTOR_LIMIT = Number(process.env.QDRANT_VECTOR_LIMIT || 8);
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const RAG_DEBUG = /^true$/i.test(process.env.RAG_DEBUG || '');
const QDRANT_COLLECTION_ERROR_MESSAGE = 'La coleccion de Qdrant indicada no existe o no esta disponible.';
const WEB_SEARCH_TRIGGER_REGEX = /\bbusca\s+en\s+internet\b/gi;
const WEB_SEARCH_TRIGGER_TEST_REGEX = /\bbusca\s+en\s+internet\b/i;
const EMPTY_WEB_SEARCH_PROMPT_MESSAGE = 'La consulta no puede contener unicamente la instruccion de buscar en internet.';
const WEB_SEARCH_NOT_CONFIGURED_MESSAGE = 'La busqueda en internet no esta configurada.';
const WEB_SEARCH_UNAVAILABLE_MESSAGE = 'La busqueda en internet no esta disponible en este momento.';

const createPublicError = ({ name, status, publicMessage, cause }) => {
    const error = new Error(publicMessage);
    error.name = name;
    error.status = status;
    error.publicMessage = publicMessage;
    error.cause = cause;
    return error;
};

export const cleanWebSearchTrigger = (prompt) => prompt
    .replace(WEB_SEARCH_TRIGGER_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const shouldUseWebSearch = ({ prompt, webSearch = false }) => (
    webSearch === true || WEB_SEARCH_TRIGGER_TEST_REGEX.test(prompt)
);

const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
};

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const normalizeWebSources = ({ citations = [], searchResults = [] } = {}) => {
    const resultsByUrl = new Map(
        searchResults
            .filter(result => isHttpUrl(result?.url))
            .map(result => [result.url, result])
    );
    const candidateUrls = [
        ...citations,
        ...searchResults.map(result => result?.url)
    ];
    const sourcesByUrl = new Map();

    candidateUrls.forEach(url => {
        if (!isHttpUrl(url) || sourcesByUrl.has(url)) return;

        const result = resultsByUrl.get(url) || {};
        sourcesByUrl.set(url, {
            titulo: result.title || url,
            url,
            fecha: result.date || result.last_updated || ''
        });
    });

    return [...sourcesByUrl.values()];
};

export const appendWebSourcesHtml = (responseHtml, sources) => {
    if (sources.length === 0) return responseHtml;

    const items = sources
        .map(source => {
            const title = escapeHtml(source.titulo);
            const url = escapeHtml(source.url);
            const date = source.fecha ? ` <span>${escapeHtml(source.fecha)}</span>` : '';
            return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>${date}</li>`;
        })
        .join('');

    return `${responseHtml}<section><h3>Fuentes de internet</h3><ul>${items}</ul></section>`;
};

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
            content: message.role === 'user'
                ? cleanWebSearchTrigger(message.content)
                : message.content
        }))
        .filter(message => message.content);
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

const normalizeText = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCatalogTitle = (value) => normalizeText(value)
    .replace(/^[\s:.\-–•●]+/, '')
    .replace(/[\s:.\-–•●]+$/, '')
    .replace(/\s*\(\s*(\d+)\s*horas?\s*\)\s*$/i, '')
    .trim();

const titleCaseCatalogText = (value) => {
    const normalized = normalizeCatalogTitle(value);
    if (!normalized) return '';

    if (/[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/.test(normalized)) {
        return normalized;
    }

    return normalized.toLocaleLowerCase('es-ES')
        .replace(/(^|[\s(/-])([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1])/g, (_, prefix, letter) => (
            `${prefix}${letter.toLocaleUpperCase('es-ES')}`
        ));
};

const isLikelyReferenceFile = (fileName) => (
    /(?:ficha|programa|certificado|boe|anexo|ifct|comt|ssce|adgd|hotr|seag|eocb)/i.test(fileName || '')
);

const isLikelyBadCatalogTitle = (title) => {
    if (!title) return true;
    if (title.length < 8 || title.length > 160) return true;
    return /^(?:horas?|nivel|codigo|c[oó]digo|familia|[0-9]+)$/i.test(title);
};

const findTitleAroundCode = ({ text, code, prefixRegex, suffixRegex }) => {
    const codeIndex = text.indexOf(code);
    if (codeIndex === -1) return '';

    const before = text.slice(Math.max(0, codeIndex - 500), codeIndex);
    const after = text.slice(codeIndex + code.length, Math.min(text.length, codeIndex + 500));
    const prefixMatch = before.match(prefixRegex);
    if (prefixMatch) return titleCaseCatalogText(prefixMatch[prefixMatch.length - 1]);

    const suffixMatch = after.match(suffixRegex);
    if (suffixMatch) return titleCaseCatalogText(suffixMatch[1]);

    return '';
};

const createCatalogItem = ({ code, title = '', hours = null, sourceFile = '', sourceRank = 1, index = 0 }) => ({
    code,
    title: titleCaseCatalogText(title),
    hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
    sourceFile,
    sourceRank,
    index
});

const preferCatalogItem = (current, candidate) => {
    if (!current) return candidate;

    const currentHasGoodTitle = !isLikelyBadCatalogTitle(current.title);
    const candidateHasGoodTitle = !isLikelyBadCatalogTitle(candidate.title);
    if (!currentHasGoodTitle && candidateHasGoodTitle) return { ...current, ...candidate };
    if (!current.hours && candidate.hours) return { ...current, ...candidate };
    if (candidate.sourceRank < current.sourceRank && candidateHasGoodTitle) return { ...current, ...candidate };

    return current;
};

const addCatalogItem = (map, candidate) => {
    if (!candidate?.code) return;
    map.set(candidate.code, preferCatalogItem(map.get(candidate.code), candidate));
};

export const extractTrainingCatalog = (chunks) => {
    const modulesByCode = new Map();
    const unitsByCode = new Map();
    const practicesByCode = new Map();
    let totalHours = null;

    chunks.forEach((chunk, chunkIndex) => {
        const text = normalizeText(chunk.text);
        if (!text) return;

        const sourceRank = isLikelyReferenceFile(chunk.fileName) ? 0 : 1;
        const moduleListRegex = /\b(MF\d{4}_\d)\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        let match;
        while ((match = moduleListRegex.exec(text)) !== null) {
            addCatalogItem(modulesByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const moduleBlockRegex = /(?:M[OÓ]DULO\s+(?:FORMATIVO|PROFESIONAL)\s*(?:\d+)?\s*)?(?:Denominaci[oó]n:\s*)?([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z0-9\u00c1\u00c9\u00cd\u00d3\u00da\u00d1a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ,()./"'-]{8,180}?)\.?\s*(?:C[oó]digo:\s*)\b(MF\d{4}_\d)\b(?:.*?(?:Duraci[oó]n|Horas):?\s*(\d{2,4})\s*horas?)?/gi;
        while ((match = moduleBlockRegex.exec(text)) !== null) {
            addCatalogItem(modulesByCode, createCatalogItem({
                code: match[2],
                title: match[1],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const moduleCodeRegex = /\b(MF\d{4}_\d)\b/g;
        while ((match = moduleCodeRegex.exec(text)) !== null) {
            const code = match[1];
            const existing = modulesByCode.get(code);
            if (existing && !isLikelyBadCatalogTitle(existing.title) && existing.hours) continue;

            const title = findTitleAroundCode({
                text,
                code,
                prefixRegex: /(?:M[OÓ]DULO\s+(?:FORMATIVO|PROFESIONAL)(?::|\s*[-–])?\s*|Denominaci[oó]n:\s*)([^.;\n\r]{8,180})$/i,
                suffixRegex: /^[:\s\-–]*(?:\([^)]+\)\s*)?([^.;●•\n\r]{8,180})/i
            });
            const after = text.slice(match.index, Math.min(text.length, match.index + 400));
            const hoursMatch = after.match(/(?:Duraci[oó]n|Horas):?\s*(\d{2,4})\s*horas?|\((\d{2,4})\s*horas?\)/i);

            addCatalogItem(modulesByCode, createCatalogItem({
                code,
                title,
                hours: hoursMatch?.[1] || hoursMatch?.[2],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const unitRegex = /\b(UF\d{4})\b\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        while ((match = unitRegex.exec(text)) !== null) {
            addCatalogItem(unitsByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const unitBlockRegex = /(?:UNIDAD\s+FORMATIVA\s*(?:\d+)?\s*)?(?:Denominaci[oó]n:\s*)?([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z0-9\u00c1\u00c9\u00cd\u00d3\u00da\u00d1a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ,()./"'-]{8,180}?)\.?\s*C[oó]digo:\s*\b(UF\d{4})\b(?:.*?Duraci[oó]n:?\s*(\d{2,4})\s*horas?)?/gi;
        while ((match = unitBlockRegex.exec(text)) !== null) {
            addCatalogItem(unitsByCode, createCatalogItem({
                code: match[2],
                title: match[1],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const practiceRegex = /\b(MP\d{4})\b\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        while ((match = practiceRegex.exec(text)) !== null) {
            addCatalogItem(practicesByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const totalMatch = text.match(/Duraci[oó]n\s+horas\s+totales\s+(?:certificado|curso|especialidad)[^0-9]{0,20}(\d{2,4})|Duraci[oó]n\s+de\s+la\s+formaci[oó]n\s+asociada:\s*(\d{2,4})\s*horas|Horas\s+totales:\s*(\d{2,4})/i);
        if (totalMatch) {
            totalHours = Number(totalMatch[1] || totalMatch[2] || totalMatch[3]);
        }
    });

    const byCatalogCode = (a, b) => a.code.localeCompare(b.code, 'es', { numeric: true });

    return {
        modules: [...modulesByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        units: [...unitsByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        practices: [...practicesByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        totalHours
    };
};

export const isStructuralQuestion = (prompt) => (
    /\b(?:cu[aá]ntos?|qu[eé]|lista|listar|enumera|estructura|contenidos?|temario|manuales?|libros?|horas?|duraci[oó]n|unidades?\s+formativas?|m[oó]dulos?)\b/i.test(prompt)
    && /\b(?:m[oó]dulos?|unidades?\s+formativas?|manuales?|libros?|curso|contenidos?|temario|estructura|horas?|duraci[oó]n)\b/i.test(prompt)
);

const formatHours = (hours) => hours ? ` (${hours} horas)` : '';

export const buildStructuralContext = ({ files = [], catalog = {} } = {}) => {
    const lines = ['ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION'];

    if (files.length > 0) {
        lines.push('Archivos cargados:');
        files.forEach(file => {
            lines.push(`- ${file.fileName}: ${file.chunks} fragmentos`);
        });
    }

    if (catalog.totalHours) {
        lines.push(`Duracion total detectada: ${catalog.totalHours} horas`);
    }

    if (catalog.modules?.length > 0) {
        lines.push(`Modulos formativos oficiales detectados: ${catalog.modules.length}`);
        catalog.modules.forEach(module => {
            lines.push(`- ${module.code}: ${module.title}${formatHours(module.hours)}`);
        });
    } else {
        lines.push('Modulos formativos oficiales detectados: no se ha detectado un listado canonico de modulos formativos.');
    }

    if (catalog.units?.length > 0) {
        lines.push('Unidades formativas detectadas:');
        catalog.units.forEach(unit => {
            lines.push(`- ${unit.code}: ${unit.title}${formatHours(unit.hours)}`);
        });
    }

    if (catalog.practices?.length > 0) {
        lines.push('Modulo de practicas detectado, separado de los modulos formativos:');
        catalog.practices.forEach(practice => {
            lines.push(`- ${practice.code}: ${practice.title}${formatHours(practice.hours)}`);
        });
    }

    lines.push('Regla: para preguntas sobre numero/listado de modulos, unidades, manuales, horas o estructura del curso, usa este bloque como fuente preferente. No concluyas que solo existen los elementos presentes en fragmentos vectoriales parciales si este bloque contiene un listado mas completo.');

    return lines.join('\n').slice(0, COLLECTION_STRUCTURAL_CONTEXT_CHARS);
};

export const buildCollectionSummaryContext = ({ files = [], catalog = {} } = {}) => {
    const lines = ['MEMORIA DOCUMENTAL DE LA COLECCION QDRANT'];

    if (files.length > 0) {
        lines.push(`Archivos disponibles: ${files.map(file => file.fileName).join(', ')}`);
    }

    if (catalog.modules?.length > 0) {
        lines.push(`Modulos formativos detectados: ${catalog.modules.map(module => `${module.code} ${module.title}`).join('; ')}`);
    }

    if (catalog.practices?.length > 0) {
        lines.push(`Practicas detectadas: ${catalog.practices.map(practice => `${practice.code} ${practice.title}`).join('; ')}`);
    }

    lines.push('Regla: salvo busqueda web activada, toda respuesta debe estar respaldada por fragmentos recuperados de esta coleccion. El historial solo ayuda a interpretar referencias, nunca sustituye a la coleccion.');

    return lines.join('\n').slice(0, COLLECTION_SUMMARY_CONTEXT_CHARS);
};

const escapeResponseText = (value) => escapeHtml(value);

export const createInsufficientContextResponse = (prompt) => {
    const question = escapeResponseText(prompt);
    return `<section><h2>Informacion no disponible en la documentacion</h2><p>No encuentro en la documentacion disponible informacion suficiente para responder con seguridad a la consulta: <strong>${question}</strong>.</p><p>Puede reformular la pregunta indicando el tema, modulo, apartado o pagina concreta que quiere consultar.</p></section>`;
};

export const isAmbiguousDocumentQuestion = ({ prompt, explicitPages = [], lexicalChunks = [], structuralQuestion = false }) => {
    if (structuralQuestion || explicitPages.length > 0 || lexicalChunks.length > 0) return false;
    const normalized = normalizeText(prompt).toLowerCase();
    return /^(?:eso|esto|lo anterior|el anterior|la anterior|el segundo|el primero|el punto|ese punto|esa parte)\b/i.test(normalized);
};

export const hasSufficientDocumentContext = ({
    structuralQuestion = false,
    structuralContext = '',
    explicitPages = [],
    lexicalChunks = [],
    searchResult = []
}) => {
    if (
        structuralQuestion
        && structuralContext.includes('Modulos formativos oficiales detectados:')
        && !structuralContext.includes('no se ha detectado un listado canonico')
    ) return true;
    if (explicitPages.length > 0) return true;
    if (lexicalChunks.some(chunk => {
        if (!Number.isInteger(chunk.termCount) || !Number.isInteger(chunk.matchedTerms)) return true;
        return chunk.matchedTerms >= Math.min(2, chunk.termCount);
    })) return true;

    const vectorContextChars = searchResult.reduce((total, hit) => total + (hit.payload?.text?.length || 0), 0);
    const hasStrongVectorHit = searchResult.some(hit => Number(hit.score) >= RAG_MIN_VECTOR_SCORE);
    return hasStrongVectorHit && vectorContextChars >= RAG_MIN_CONTEXT_CHARS;
};

const getLexicalTerms = (prompt) => normalizeText(prompt)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9_]+/)
    .filter(term => term.length >= 4 && ![
        'este',
        'esta',
        'curso',
        'cual',
        'cuales',
        'cuantos',
        'cuantas',
        'tiene',
        'lista',
        'listar',
        'dime',
        'sobre'
    ].includes(term));

const getLexicalContextChunks = ({ chunks, prompt, limit = LEXICAL_LIMIT }) => {
    const terms = getLexicalTerms(prompt);
    if (terms.length === 0) return [];

    return chunks
        .map(chunk => {
            const searchableText = normalizeText(`${chunk.fileName} ${chunk.text}`)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            const matchedTerms = terms.filter(term => searchableText.includes(term)).length;
            const score = matchedTerms
                + (isLikelyReferenceFile(chunk.fileName) ? 0.25 : 0);
            return { ...chunk, score, matchedTerms, termCount: terms.length };
        })
        .filter(chunk => chunk.matchedTerms > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

const pruneCache = () => {
    while (collectionCache.size > CACHE_MAX_COLLECTIONS) {
        const oldestKey = collectionCache.keys().next().value;
        collectionCache.delete(oldestKey);
    }
};

export const invalidateCollectionCache = (vsIdQdrant) => {
    collectionCache.delete(vsIdQdrant);
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
    const chunks = [];
    const filesByName = new Map();
    allPoints.forEach(point => {
        const text = point.payload?.text || '';
        const fileName = point.payload?.file_name || '';
        const pageMatch = text.match(/<PARSED TEXT FOR PAGE:\s*(\d+)\s*\/\s*\d+>/);

        filesByName.set(fileName, (filesByName.get(fileName) || 0) + 1);
        chunks.push({
            id: point.id,
            fileName,
            text
        });

        if (pageMatch) {
            pages.push({
                id: point.id,
                pageNum: parseInt(pageMatch[1], 10),
                fileName,
                text
            });
        }
    });

    const files = [...filesByName.entries()]
        .map(([fileName, chunksCount]) => ({ fileName, chunks: chunksCount }))
        .sort((a, b) => {
            if (isLikelyReferenceFile(a.fileName) !== isLikelyReferenceFile(b.fileName)) {
                return isLikelyReferenceFile(a.fileName) ? -1 : 1;
            }
            return a.fileName.localeCompare(b.fileName);
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

    const catalog = extractTrainingCatalog(chunks);
    const data = { pages, toc, chunks, files, catalog };
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

const buildContext = ({ collectionSummaryContext = '', structuralContext = '', explicitPages = [], lexicalChunks = [], searchResult = [] }) => {
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

    addContext('collection_summary_context', collectionSummaryContext);
    addContext('structural_context', structuralContext);

    explicitPages.forEach(page => {
        addContext(`${page.fileName}_${page.pageNum}`, page.text);
    });

    lexicalChunks.forEach(chunk => {
        addContext(`lexical_${chunk.id}`, chunk.text);
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

    const instructions = instructionsTemplate
        .replace(/{curso}/g, curso)
        .replace(/{context}/g, context);

    const ragRule = context.includes('MEMORIA DOCUMENTAL DE LA COLECCION QDRANT')
        ? `

REGLA PRIORITARIA RAG DOCUMENTAL

Para cualquier pregunta sin busqueda web, responde exclusivamente desde el contexto recuperado de Qdrant.
No uses conocimiento externo ni el historial para completar huecos. El historial solo sirve para resolver referencias del usuario y siempre queda subordinado al contexto documental actual.
Si el contexto recuperado no respalda una afirmacion, no la afirmes: indica que esa informacion no aparece en la documentacion disponible o pide precision si la pregunta es ambigua.`
        : '';

    if (!context.includes('ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION')) {
        return `${instructions}${ragRule}`;
    }

    return `${instructions}${ragRule}

REGLA PRIORITARIA SOBRE ESTRUCTURA DE CURSO

Si el contexto incluye el bloque "ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION", usalo como fuente preferente para responder preguntas sobre numero o listado de modulos, unidades formativas, practicas, manuales, contenidos, horas o estructura del curso.
No digas que solo existe un modulo, unidad o manual basandote en fragmentos vectoriales parciales si ese bloque contiene un listado mas completo.
Las practicas MP deben distinguirse de los modulos formativos MF, salvo que el usuario pida incluir todo.`;
};

const getWebInstructions = async ({ curso, context }) => {
    const instructions = await getInstructions({ curso, context });
    return `${instructions}

BUSQUEDA EXTERNA ACTIVADA

Debes complementar el contexto oficial con una busqueda en internet.
Indica claramente que informacion procede de internet y cual procede del contexto oficial.
Responde exclusivamente con HTML valido, sin Markdown.
No anadas una seccion de fuentes: el sistema la incorporara automaticamente.`;
};

export const getWebResponse = async ({ curso, context, prompt, history = [], perplexityClient = perplexity }) => {
    if (!perplexityClient) {
        throw createPublicError({
            name: 'WebSearchConfigurationError',
            status: 503,
            publicMessage: WEB_SEARCH_NOT_CONFIGURED_MESSAGE
        });
    }

    try {
        const chatCompletion = await perplexityClient.chat.completions.create({
            model: PERPLEXITY_MODEL,
            messages: [
                { role: 'system', content: await getWebInstructions({ curso, context }) },
                ...history,
                { role: 'user', content: prompt }
            ]
        });
        const sources = normalizeWebSources({
            citations: chatCompletion.citations,
            searchResults: chatCompletion.search_results
        });
        const responseHtml = chatCompletion.choices[0]?.message?.content || 'No pude generar una respuesta.';

        return {
            respuesta: appendWebSourcesHtml(responseHtml, sources),
            webSearchUsed: true,
            sources
        };
    } catch (err) {
        if (err?.status === 503 && err?.name === 'WebSearchConfigurationError') throw err;

        console.error('[TutorService] Error al consultar Perplexity Sonar:', err);
        throw createPublicError({
            name: 'WebSearchProviderError',
            status: 502,
            publicMessage: WEB_SEARCH_UNAVAILABLE_MESSAGE,
            cause: err
        });
    }
};

export const getTutorResponse = async ({ curso, vsIdQdrant, prompt, history = [], webSearch = false }) => {
    const webSearchUsed = shouldUseWebSearch({ prompt, webSearch });
    const cleanPrompt = cleanWebSearchTrigger(prompt);
    if (!cleanPrompt) {
        throw createPublicError({
            name: 'EmptyWebSearchPromptError',
            status: 400,
            publicMessage: EMPTY_WEB_SEARCH_PROMPT_MESSAGE
        });
    }
    if (webSearchUsed && !perplexity) {
        throw createPublicError({
            name: 'WebSearchConfigurationError',
            status: 503,
            publicMessage: WEB_SEARCH_NOT_CONFIGURED_MESSAGE
        });
    }

    const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanPrompt
    });
    const [{ embedding }] = embeddingResponse.data;

    const searchResult = await searchQdrantCollection(vsIdQdrant, {
        vector: embedding,
        limit: VECTOR_LIMIT
    });

    let collectionData = null;
    let collectionSummaryContext = '';
    let structuralContext = '';
    let lexicalChunks = [];
    const structuralQuestion = isStructuralQuestion(cleanPrompt);
    try {
        collectionData = await getCollectionData(vsIdQdrant);
        collectionSummaryContext = buildCollectionSummaryContext({
            files: collectionData.files,
            catalog: collectionData.catalog
        });
        lexicalChunks = getLexicalContextChunks({
            chunks: collectionData.chunks,
            prompt: cleanPrompt
        });

        if (structuralQuestion) {
            structuralContext = buildStructuralContext({
                files: collectionData.files,
                catalog: collectionData.catalog
            });
        }
    } catch (err) {
        console.error('[TutorService] Error al construir memoria estructural de la coleccion:', err);
    }

    let explicitPages = [];
    try {
        explicitPages = await getExplicitContextPages({ vsIdQdrant, prompt: cleanPrompt });
    } catch (err) {
        console.error('[TutorService] Error al intentar recuperar contexto determinista:', err);
    }

    if (RAG_DEBUG && collectionData) {
        console.log('[TutorService] RAG debug:', JSON.stringify({
            collection: vsIdQdrant,
            structuralQuestion,
            files: collectionData.files,
            modules: collectionData.catalog.modules.map(module => module.code),
            units: collectionData.catalog.units.map(unit => unit.code),
            practices: collectionData.catalog.practices.map(practice => practice.code),
            sufficientContext: hasSufficientDocumentContext({
                structuralQuestion,
                structuralContext,
                explicitPages,
                lexicalChunks,
                searchResult
            }),
            ambiguousQuestion: isAmbiguousDocumentQuestion({
                prompt: cleanPrompt,
                explicitPages,
                lexicalChunks,
                structuralQuestion
            }),
            lexicalChunkIds: lexicalChunks.map(chunk => chunk.id),
            vectorHitIds: searchResult.map(hit => hit.id)
        }));
    }

    if (!webSearchUsed) {
        const ambiguousQuestion = isAmbiguousDocumentQuestion({
            prompt: cleanPrompt,
            explicitPages,
            lexicalChunks,
            structuralQuestion
        });
        const sufficientContext = hasSufficientDocumentContext({
            structuralQuestion,
            structuralContext,
            explicitPages,
            lexicalChunks,
            searchResult
        });

        if (ambiguousQuestion || !sufficientContext) {
            return {
                respuesta: createInsufficientContextResponse(cleanPrompt),
                webSearchUsed: false,
                sources: []
            };
        }
    }

    const context = buildContext({
        collectionSummaryContext,
        structuralContext,
        explicitPages,
        lexicalChunks,
        searchResult
    });
    const normalizedHistory = normalizeHistory(history);
    if (webSearchUsed) {
        return getWebResponse({
            curso,
            context,
            prompt: cleanPrompt,
            history: normalizedHistory
        });
    }

    const systemInstruction = await getInstructions({ curso, context });
    const chatCompletion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
            { role: 'system', content: systemInstruction },
            ...normalizedHistory,
            { role: 'user', content: cleanPrompt }
        ],
        temperature: 0.4
    });

    return {
        respuesta: chatCompletion.choices[0].message.content || 'No pude generar una respuesta.',
        webSearchUsed: false,
        sources: []
    };
};
