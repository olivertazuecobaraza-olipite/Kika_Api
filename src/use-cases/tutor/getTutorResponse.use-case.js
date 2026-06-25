import { openai } from '../../config/openai.js';
import { perplexity } from '../../config/perplexity.js';
import { qdrant } from '../../config/qdrant.js';
import { buildCollectionSummaryContext } from './buildCollectionSummaryContext.use-case.js';
import { buildStructuralContext } from './buildStructuralContext.use-case.js';
import { classifyTutorPrompt } from './classifyTutorPrompt.use-case.js';
import { cleanWebSearchTrigger } from './cleanWebSearchTrigger.use-case.js';
import { createExternalKnowledgeResponse } from './createExternalKnowledgeResponse.use-case.js';
import { detectResponseLanguage } from './detectResponseLanguage.use-case.js';
import { extractTrainingCatalog } from './extractTrainingCatalog.use-case.js';
import { getWebResponse } from './getWebResponse.use-case.js';
import { hasSufficientDocumentContext } from './hasSufficientDocumentContext.use-case.js';
import { isAmbiguousDocumentQuestion } from './isAmbiguousDocumentQuestion.use-case.js';
import { isStructuralQuestion } from './isStructuralQuestion.use-case.js';
import { normalizeAssistantHtml } from './normalizeAssistantHtml.use-case.js';
import { shouldUseWebSearch } from './shouldUseWebSearch.use-case.js';
import {
    deleteCollectionLoad,
    getCollectionCache,
    getCollectionLoad,
    setCollectionCache,
    setCollectionLoad
} from './_internal/collection-cache.js';
import { getInstructions } from './_internal/instructions.js';
import { escapeHtml, getLocalizedCopy, localizedCopy } from './_internal/localization.js';
import { createPublicError } from './_internal/public-error.js';
import { createPerfTimer, isPerfDebugEnabled } from '../../utils/perf.js';

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);
const MAX_CONTEXT_CHARS = Number(process.env.MAX_CONTEXT_CHARS || 18000);
const LEXICAL_LIMIT = Number(process.env.QDRANT_LEXICAL_LIMIT || 6);
const VECTOR_LIMIT = Number(process.env.QDRANT_VECTOR_LIMIT || 8);
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const RAG_DEBUG = /^true$/i.test(process.env.RAG_DEBUG || '');
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 0);
const QDRANT_TIMEOUT_MS = Number(process.env.QDRANT_TIMEOUT_MS || 0);
const QDRANT_COLLECTION_ERROR_MESSAGE = 'La coleccion de Qdrant indicada no existe o no esta disponible.';
const EMPTY_WEB_SEARCH_PROMPT_MESSAGE = 'La consulta no puede contener unicamente la instruccion de buscar en internet.';
const WEB_SEARCH_NOT_CONFIGURED_MESSAGE = 'La busqueda en internet no esta configurada.';

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

const withTimeout = async (promise, timeoutMs, name) => {
    if (!timeoutMs || timeoutMs <= 0) return promise;

    let timeoutId;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const error = new Error(`${name} timeout`);
                    error.name = 'ProviderTimeoutError';
                    error.status = 504;
                    reject(error);
                }, timeoutMs);
            })
        ]);
    } finally {
        clearTimeout(timeoutId);
    }
};

const getOpenAiRequestOptions = () => OPENAI_TIMEOUT_MS > 0
    ? { timeout: OPENAI_TIMEOUT_MS }
    : undefined;

const searchQdrantCollection = async (vsIdQdrant, options) => {
    try {
        return await withTimeout(
            qdrant.search(vsIdQdrant, options),
            QDRANT_TIMEOUT_MS,
            'qdrant.search'
        );
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

const isLikelyReferenceFile = (fileName) => (
    /(?:ficha|programa|certificado|boe|anexo|ifct|comt|ssce|adgd|hotr|seag|eocb)/i.test(fileName || '')
);
const escapeResponseText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const createAmbiguousQuestionResponse = (prompt, responseLanguage = detectResponseLanguage(prompt)) => {
    const question = escapeResponseText(prompt);
    const copy = getLocalizedCopy(responseLanguage);
    const title = copy.ambiguousTitle || localizedCopy.en.ambiguousTitle;
    const body = copy.ambiguousBody || localizedCopy.en.ambiguousBody;
    const hint = copy.ambiguousHint || localizedCopy.en.ambiguousHint;
    return `<section><h2>${title}</h2><p>${body} <strong>${question}</strong>.</p><p>${hint}</p></section>`;
};

const createSmalltalkResponse = (responseLanguage) => {
    const copy = getLocalizedCopy(responseLanguage);
    return `<section><h2>${copy.smalltalkTitle || localizedCopy.en.smalltalkTitle}</h2><p>${copy.smalltalk}</p></section>`;
};

const renderListItems = (items = []) => items
    .map(item => `<li>${escapeHtml(item)}</li>`)
    .join('');

const createIdentityResponse = (responseLanguage) => {
    const copy = getLocalizedCopy(responseLanguage);
    const title = copy.identityTitle || localizedCopy.en.identityTitle;
    const items = copy.identityItems || localizedCopy.en.identityItems;
    return `<section><h2>${title}</h2><p>${copy.identity}</p><ul>${renderListItems(items)}</ul></section>`;
};

const createHelpResponse = (responseLanguage) => {
    const copy = getLocalizedCopy(responseLanguage);
    const title = copy.helpTitle || localizedCopy.en.helpTitle;
    const items = copy.helpItems || localizedCopy.en.helpItems;
    return `<section><h2>${title}</h2><p>${copy.help}</p><ul>${renderListItems(items)}</ul></section>`;
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
            const searchableText = chunk.searchableText || normalizeText(`${chunk.fileName} ${chunk.text}`)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            const matchedTerms = terms.filter(term => searchableText.includes(term)).length;
            const score = matchedTerms
                + (chunk.referenceFile ? 0.25 : 0);
            return { ...chunk, score, matchedTerms, termCount: terms.length };
        })
        .filter(chunk => chunk.matchedTerms > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

const loadCollectionData = async (vsIdQdrant) => {
    let offset = undefined;
    const allPoints = [];
    do {
        const response = await withTimeout(
            qdrant.scroll(vsIdQdrant, {
                limit: 100,
                with_payload: true,
                with_vector: false,
                offset
            }),
            QDRANT_TIMEOUT_MS,
            'qdrant.scroll'
        );

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
            text,
            referenceFile: isLikelyReferenceFile(fileName),
            searchableText: normalizeText(`${fileName} ${text}`)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
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
    return { pages, toc, chunks, files, catalog };
};

const getCollectionData = async (vsIdQdrant) => {
    const cached = getCollectionCache(vsIdQdrant);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const existingLoad = getCollectionLoad(vsIdQdrant);
    if (existingLoad) {
        return existingLoad;
    }

    const load = loadCollectionData(vsIdQdrant)
        .then(data => {
            setCollectionCache(vsIdQdrant, { timestamp: Date.now(), data });
            return data;
        })
        .finally(() => {
            deleteCollectionLoad(vsIdQdrant);
        });
    setCollectionLoad(vsIdQdrant, load);

    return load;
};

const getExplicitContextPages = async ({ vsIdQdrant, prompt, collectionData = null }) => {
    const pageMatch = prompt.match(/(?:p[a\u00e1]g(?:ina)?|pg\.?|p\.)\s*(\d+)\b/i);
    const sectionMatch = prompt.match(/(?:cap[\u00ed\u00edi]tulo|tema|punto|secci[o\u00f3]n|unidad|apartado|m[o\u00f3]dulo|bloque|parte)\s*(\d+(?:\.\d+)*)\b/i)
        || prompt.match(/\b(\d+\.\d+(?:\.\d+)*)\b/);

    if (!pageMatch && !sectionMatch) {
        return [];
    }

    const { pages, toc } = collectionData || await getCollectionData(vsIdQdrant);

    if (pageMatch) {
        const pageNum = parseInt(pageMatch[1], 10);
        const pageStart = Math.max(1, pageNum - 1);
        const pageEnd = pageNum + 1;
        const explicitPages = pages.filter(page => page.pageNum >= pageStart && page.pageNum <= pageEnd);

        if (RAG_DEBUG || isPerfDebugEnabled()) {
            console.log(`[TutorService] Recuperacion exacta por pagina ${pageNum}. Rango: ${pageStart}-${pageEnd}. Encontradas: ${explicitPages.length} pag(s).`);
        }
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

    if (RAG_DEBUG || isPerfDebugEnabled()) {
        console.log(`[TutorService] Recuperacion exacta por seccion ${sectionNum}. Rango: ${pageStart}-${pageEnd}. Encontradas: ${explicitPages.length} pag(s).`);
    }
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

export const getTutorResponse = async ({ curso, vsIdQdrant, prompt, history = [], webSearch = false }) => {
    const perf = createPerfTimer('perf.tutor_response', { collection: vsIdQdrant, web_search_requested: webSearch === true });
    const webSearchUsed = shouldUseWebSearch({ prompt, webSearch });
    const cleanPrompt = cleanWebSearchTrigger(prompt);
    const responseLanguage = detectResponseLanguage(cleanPrompt || prompt);
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

    const promptIntent = classifyTutorPrompt(cleanPrompt);
    if (!webSearchUsed) {
        if (promptIntent === 'smalltalk') {
            return {
                respuesta: createSmalltalkResponse(responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }

        if (promptIntent === 'identity') {
            return {
                respuesta: createIdentityResponse(responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }

        if (promptIntent === 'help') {
            return {
                respuesta: createHelpResponse(responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }

        if (promptIntent === 'ambiguous') {
            return {
                respuesta: createAmbiguousQuestionResponse(cleanPrompt, responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }

        if (promptIntent === 'external_knowledge') {
            return {
                respuesta: createExternalKnowledgeResponse(cleanPrompt, responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }
    }

    const collectionDataResultPromise = perf.track('collection_load', async () => getCollectionData(vsIdQdrant))
        .then(data => ({ data }))
        .catch(error => ({ error }));

    const embeddingResponse = await perf.track('embedding', async () => openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: cleanPrompt
    }, getOpenAiRequestOptions()));
    const [{ embedding }] = embeddingResponse.data;

    const searchResult = await perf.track('qdrant_search', async () => searchQdrantCollection(vsIdQdrant, {
        vector: embedding,
        limit: VECTOR_LIMIT
    }));

    let collectionData = null;
    let collectionSummaryContext = '';
    let structuralContext = '';
    let lexicalChunks = [];
    const structuralQuestion = isStructuralQuestion(cleanPrompt);
    const collectionDataResult = await collectionDataResultPromise;
    if (collectionDataResult.data) {
        collectionData = collectionDataResult.data;
    } else {
        console.error('[TutorService] Error al construir memoria estructural de la coleccion:', collectionDataResult.error);
    }
    if (collectionData) {
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
    }

    let explicitPages = [];
    try {
        explicitPages = await perf.track('explicit_context', async () => getExplicitContextPages({
            vsIdQdrant,
            prompt: cleanPrompt,
            collectionData
        }));
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

        if (ambiguousQuestion) {
            return {
                respuesta: createAmbiguousQuestionResponse(cleanPrompt, responseLanguage),
                webSearchUsed: false,
                sources: []
            };
        }
    }

    const context = await perf.track('context_build', async () => buildContext({
        collectionSummaryContext,
        structuralContext,
        explicitPages,
        lexicalChunks,
        searchResult
    }));
    const normalizedHistory = normalizeHistory(history);
    if (webSearchUsed) {
        const response = await perf.track('llm', async () => getWebResponse({
            curso,
            context,
            prompt: cleanPrompt,
            history: normalizedHistory,
            responseLanguage
        }));
        perf.flush({ web_search_used: true });
        return response;
    }

    const systemInstruction = await getInstructions({ curso, context, responseLanguage });
    const chatCompletion = await perf.track('llm', async () => openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
            { role: 'system', content: systemInstruction },
            ...normalizedHistory,
            { role: 'user', content: cleanPrompt }
        ],
        temperature: 0.4
    }, getOpenAiRequestOptions()));

    const response = {
        respuesta: normalizeAssistantHtml(chatCompletion.choices[0].message.content),
        webSearchUsed: false,
        sources: []
    };
    perf.flush({ web_search_used: false });
    return response;
};
