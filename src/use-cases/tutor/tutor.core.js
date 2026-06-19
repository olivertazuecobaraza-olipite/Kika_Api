// src/use-cases/tutor/tutor.core.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { openai } from '../../config/openai.js';
import { perplexity } from '../../config/perplexity.js';
import { qdrant } from '../../config/qdrant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INSTRUCTIONS_PATH = path.resolve(__dirname, '../../../instrucciones.agente.txt');

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

const LANGUAGE_PROFILES = {
    en: { languageName: 'English', localeHint: 'en' },
    es: { languageName: 'Spanish', localeHint: 'es' },
    pt: { languageName: 'Portuguese', localeHint: 'pt' },
    fr: { languageName: 'French', localeHint: 'fr' },
    ca: { languageName: 'Catalan', localeHint: 'ca' },
    gl: { languageName: 'Galician', localeHint: 'gl' },
    eu: { languageName: 'Basque', localeHint: 'eu' },
    de: { languageName: 'German', localeHint: 'de' },
    it: { languageName: 'Italian', localeHint: 'it' },
    ru: { languageName: 'Russian', localeHint: 'ru' },
    zh: { languageName: 'Chinese', localeHint: 'zh' },
    ja: { languageName: 'Japanese', localeHint: 'ja' },
    ar: { languageName: 'Arabic', localeHint: 'ar' },
    ko: { languageName: 'Korean', localeHint: 'ko' }
};

const LANGUAGE_ALIASES = new Map([
    ['english', 'en'], ['ingles', 'en'], ['inglés', 'en'], ['inglês', 'en'],
    ['spanish', 'es'], ['espanol', 'es'], ['español', 'es'], ['castellano', 'es'],
    ['portuguese', 'pt'], ['portugues', 'pt'], ['portugués', 'pt'], ['português', 'pt'],
    ['french', 'fr'], ['frances', 'fr'], ['francés', 'fr'], ['français', 'fr'],
    ['catalan', 'ca'], ['catalán', 'ca'], ['catala', 'ca'], ['català', 'ca'], ['valenciano', 'ca'], ['valencià', 'ca'],
    ['galician', 'gl'], ['gallego', 'gl'], ['galego', 'gl'],
    ['basque', 'eu'], ['euskera', 'eu'], ['euskara', 'eu'], ['vasco', 'eu'],
    ['german', 'de'], ['aleman', 'de'], ['alemán', 'de'], ['deutsch', 'de'],
    ['italian', 'it'], ['italiano', 'it'],
    ['russian', 'ru'], ['ruso', 'ru'], ['русский', 'ru'],
    ['chinese', 'zh'], ['chino', 'zh'], ['中文', 'zh'],
    ['japanese', 'ja'], ['japones', 'ja'], ['japonés', 'ja'], ['日本語', 'ja'],
    ['arabic', 'ar'], ['arabe', 'ar'], ['árabe', 'ar'], ['العربية', 'ar'],
    ['korean', 'ko'], ['coreano', 'ko'], ['한국어', 'ko']
]);

const normalizeForDetection = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const detectExplicitLanguageCode = (prompt) => {
    const patterns = [
        /\b(?:respond|reply|answer)\s+in\s+([a-záéíóúàèìòùâêîôûãõçñü]+)\b/i,
        /\b(?:responde|contesta|contestame|contéstame|responder)\s+en\s+([a-záéíóúàèìòùâêîôûãõçñü]+)\b/i,
        /\b(?:responda|responde|contesta)\s+em\s+([a-záéíóúàèìòùâêîôûãõçñü]+)\b/i
    ];

    for (const pattern of patterns) {
        const match = String(prompt || '').match(pattern);
        if (!match) continue;

        const languageCode = LANGUAGE_ALIASES.get(match[1].toLowerCase())
            || LANGUAGE_ALIASES.get(normalizeForDetection(match[1]));
        if (languageCode) return languageCode;
    }

    return '';
};

const stripExplicitLanguageInstruction = (prompt) => String(prompt || '')
    .replace(/^\s*(?:respond|reply|answer)\s+in\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .replace(/^\s*(?:responde|contesta|contestame|contéstame|responder)\s+en\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .replace(/^\s*(?:responda|responde|contesta)\s+em\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .trim();

const stripLeadingGreeting = (prompt) => {
    const trimmed = String(prompt || '').trim();
    const match = trimmed.match(/^(?:hi|hello|hey|hola|buenas|ol[aá]|bonjour|salut|ciao|hallo|oi)\b[\s,;:!-]*(.+)$/i);
    return match?.[1]?.trim() || trimmed;
};

const countMatches = (words, candidates) => words.reduce((total, word) => (
    candidates.has(word) ? total + 1 : total
), 0);

const detectLanguageFromText = (prompt) => {
    const raw = String(prompt || '').trim();
    if (/[\u4e00-\u9fff]/.test(raw)) return { code: 'zh', score: 5, tied: false };
    if (/[\u3040-\u30ff]/.test(raw)) return { code: 'ja', score: 5, tied: false };
    if (/[\uac00-\ud7af]/.test(raw)) return { code: 'ko', score: 5, tied: false };
    if (/[\u0600-\u06ff]/.test(raw)) return { code: 'ar', score: 5, tied: false };
    if (/[\u0400-\u04ff]/.test(raw)) return { code: 'ru', score: 5, tied: false };

    const normalized = normalizeForDetection(raw);
    const words = normalized.split(/[^a-z0-9_]+/).filter(Boolean).slice(0, 24);
    const profiles = {
        en: new Set(['hi', 'hello', 'hey', 'how', 'are', 'you', 'what', 'who', 'can', 'do', 'does', 'of', 'explain', 'module', 'course', 'documentation', 'capital', 'france', 'thanks', 'thank']),
        es: new Set(['hola', 'buenas', 'que', 'quien', 'como', 'estas', 'eres', 'puedes', 'explica', 'explicame', 'modulo', 'curso', 'documentacion', 'capital', 'francia', 'gracias', 'ayuda']),
        pt: new Set(['ola', 'oi', 'como', 'estas', 'esta', 'voce', 'qual', 'funcao', 'podes', 'pode', 'ajuda', 'obrigado', 'obrigada', 'documentacao', 'curso']),
        fr: new Set(['bonjour', 'salut', 'comment', 'allez', 'vous', 'qui', 'etes', 'peux', 'pouvez', 'expliquer', 'module', 'cours', 'documentation', 'merci']),
        ca: new Set(['hola', 'bon', 'dia', 'que', 'qui', 'com', 'estas', 'ets', 'pots', 'explica', 'modul', 'curs', 'documentacio', 'gracies']),
        gl: new Set(['ola', 'boas', 'que', 'quen', 'como', 'estas', 'es', 'podes', 'explica', 'modulo', 'curso', 'documentacion', 'grazas']),
        de: new Set(['hallo', 'guten', 'wie', 'geht', 'dir', 'wer', 'bist', 'was', 'kannst', 'erklar', 'modul', 'kurs', 'dokumentation', 'danke']),
        it: new Set(['ciao', 'buongiorno', 'come', 'stai', 'chi', 'sei', 'cosa', 'puoi', 'spiega', 'modulo', 'corso', 'documentazione', 'grazie'])
    };

    const scored = Object.entries(profiles)
        .map(([code, candidates]) => ({ code, score: countMatches(words, candidates) }))
        .sort((a, b) => b.score - a.score);

    const [best, second] = scored;
    if (!best || best.score === 0) return { code: 'es', score: 0, tied: false };
    return {
        code: best.code,
        score: best.score,
        tied: second?.score === best.score
    };
};

export const detectResponseLanguage = (prompt) => {
    const explicitCode = detectExplicitLanguageCode(prompt);
    if (explicitCode) {
        return {
            ...LANGUAGE_PROFILES[explicitCode],
            explicitOverride: true
        };
    }

    const generationTopicMatch = String(prompt || '').match(/\bTema del (?:resumen|examen|ejercicio):\s*([^\n]+)/i);
    if (generationTopicMatch?.[1]) {
        const topicDetection = detectLanguageFromText(generationTopicMatch[1]);
        if (topicDetection.score > 0 && !topicDetection.tied) {
            return {
                ...(LANGUAGE_PROFILES[topicDetection.code] || LANGUAGE_PROFILES.es),
                explicitOverride: false
            };
        }
    }

    const withoutExplicitInstruction = stripExplicitLanguageInstruction(prompt);
    const withoutGreeting = stripLeadingGreeting(withoutExplicitInstruction);
    const candidateDetection = detectLanguageFromText(withoutGreeting);
    const originalDetection = detectLanguageFromText(withoutExplicitInstruction);
    const selectedCode = withoutGreeting !== withoutExplicitInstruction
        && candidateDetection.score >= 2
        && !candidateDetection.tied
        ? candidateDetection.code
        : originalDetection.code;

    return {
        ...(LANGUAGE_PROFILES[selectedCode] || LANGUAGE_PROFILES.es),
        explicitOverride: false
    };
};

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

const HTML_FRAGMENT_TAG_REGEX = /<\/?(?:section|article|div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|blockquote|pre|code|a|span|br)\b/i;

const normalizeAssistantHtml = (value, fallbackText = 'No pude generar una respuesta.') => {
    const raw = String(value || '').trim() || fallbackText;
    if (HTML_FRAGMENT_TAG_REGEX.test(raw)) return raw;

    const paragraphs = raw
        .split(/\n{2,}/)
        .map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
    const content = (paragraphs.length > 0 ? paragraphs : [fallbackText])
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');

    return `<section>${content}</section>`;
};

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

export const appendWebSourcesHtml = (responseHtml, sources, responseLanguage = LANGUAGE_PROFILES.es) => {
    if (sources.length === 0) return responseHtml;

    const copy = getLocalizedCopy(responseLanguage);
    const items = sources
        .map(source => {
            const title = escapeHtml(source.titulo);
            const url = escapeHtml(source.url);
            const date = source.fecha ? ` <span>${escapeHtml(source.fecha)}</span>` : '';
            return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>${date}</li>`;
        })
        .join('');

    return `${responseHtml}<section><h3>${copy.sourcesTitle}</h3><ul>${items}</ul></section>`;
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

const localizedCopy = {
    en: {
        unavailableTitle: 'Information not available in the documentation',
        unavailableBody: 'I do not find enough information in the course documentation to answer this query safely:',
        unavailableHint: 'You can rephrase the question by indicating the topic, module, section or page you want to consult.',
        ambiguousTitle: 'More detail needed',
        ambiguousBody: 'I need a more specific reference to answer this safely from the course documentation:',
        ambiguousHint: 'Please indicate the topic, module, section, page or previous message you want to consult.',
        externalTitle: 'Outside the available documentation',
        externalBody: 'That requires external knowledge. I cannot answer it unless web search is enabled:',
        externalHint: 'If you want me to consult the internet, enable web_search or include "Busca en internet" in the request.',
        smalltalkTitle: 'Ready to help',
        identityTitle: 'Course documentation tutor',
        helpTitle: 'How I can help',
        smalltalk: "I'm here and ready to help you with questions about the course documentation.",
        identity: 'I am Kika, a tutor specialized in the course documentation. I can locate, explain, summarize and clarify information from that source, and I only use internet search when web_search is enabled.',
        identityItems: ['Locate information in the available documentation.', 'Explain, summarize and clarify course content.', 'Use internet search only when web_search is enabled.'],
        help: 'I can help you work with the course documentation without inventing unsupported information.',
        helpItems: ['Ask about a course topic, module, section or page.', 'Request summaries, explanations or structured lists.', 'Ask me to compare sections when both are in the documentation.', 'Enable web_search or write "Busca en internet" to complement with external sources.'],
        sourcesTitle: 'Internet sources'
    },
    es: {
        unavailableTitle: 'Informacion no disponible en la documentacion',
        unavailableBody: 'No encuentro esa informacion en la documentacion del curso para responder con seguridad a la consulta:',
        unavailableHint: 'Puede reformular la pregunta indicando el tema, modulo, apartado o pagina concreta que quiere consultar.',
        ambiguousTitle: 'Necesito mas precision',
        ambiguousBody: 'Necesito una referencia mas concreta para responder con seguridad desde la documentacion del curso:',
        ambiguousHint: 'Indique el tema, modulo, apartado, pagina o mensaje anterior que quiere consultar.',
        externalTitle: 'Fuera de la documentacion disponible',
        externalBody: 'Eso requiere conocimiento externo. No puedo responderlo salvo que la busqueda web este activada:',
        externalHint: 'Si quiere que lo consulte en internet, active web_search o incluya "Busca en internet" en la peticion.',
        smalltalkTitle: 'Listo para ayudar',
        identityTitle: 'Tutor de documentacion del curso',
        helpTitle: 'Como puedo ayudar',
        smalltalk: 'Estoy aqui y listo para ayudarle con preguntas sobre la documentacion del curso.',
        identity: 'Soy Kika, un tutor especializado en la documentacion del curso. Puedo localizar, explicar, resumir y aclarar informacion de esa fuente, y solo uso busqueda en internet cuando web_search esta activado.',
        identityItems: ['Localizar informacion en la documentacion disponible.', 'Explicar, resumir y aclarar contenidos del curso.', 'Usar internet solo cuando web_search esta activado.'],
        help: 'Puedo ayudarle a trabajar con la documentacion del curso sin inventar informacion que no este respaldada.',
        helpItems: ['Pregunte por un tema, modulo, apartado o pagina del curso.', 'Pida resumenes, explicaciones o listas estructuradas.', 'Pida comparar apartados cuando ambos esten en la documentacion.', 'Active web_search o escriba "Busca en internet" para complementar con fuentes externas.'],
        sourcesTitle: 'Fuentes de internet'
    },
    pt: {
        unavailableTitle: 'Informacao nao disponivel na documentacao',
        unavailableBody: 'Nao encontro na documentacao disponivel informacao suficiente para responder com seguranca a consulta:',
        unavailableHint: 'Pode reformular a pergunta indicando o tema, modulo, seccao ou pagina concreta que quer consultar.',
        externalTitle: 'Fora da documentacao disponivel',
        externalBody: 'Nao posso responder com conhecimento externo a menos que a pesquisa web esteja ativada. A consulta nao esta suportada pela documentacao do curso:',
        externalHint: 'Se quiser uma resposta baseada na internet, ative web_search ou inclua "Busca en internet" no pedido.',
        smalltalk: 'Estou aqui e pronto para ajudar com perguntas sobre a documentacao do curso.',
        identity: 'Sou um tutor especializado em responder a perguntas com base na documentacao do curso. Posso localizar, explicar e resumir informacao dessa fonte, e so uso pesquisa na internet quando estiver ativada.',
        help: 'Posso ajudar a localizar, explicar, resumir e estruturar informacao da documentacao do curso. Tambem pode pedir pesquisa web ativando web_search ou incluindo "Busca en internet" no pedido.',
        sourcesTitle: 'Fontes da internet'
    },
    fr: {
        unavailableTitle: 'Information non disponible dans la documentation',
        unavailableBody: 'Je ne trouve pas assez d information dans la documentation disponible pour repondre avec certitude a la requete :',
        unavailableHint: 'Vous pouvez reformuler la question en indiquant le theme, le module, la section ou la page precise a consulter.',
        externalTitle: 'Hors de la documentation disponible',
        externalBody: 'Je ne peux pas repondre avec des connaissances externes sauf si la recherche web est activee. La requete n est pas etayee par la documentation du cours :',
        externalHint: 'Si vous voulez une reponse fondee sur internet, activez web_search ou incluez "Busca en internet" dans la demande.',
        smalltalk: 'Je suis pret a vous aider avec des questions sur la documentation du cours.',
        identity: 'Je suis un tuteur specialise dans les reponses fondees sur la documentation du cours. Je peux localiser, expliquer et resumer les informations de cette source, et utiliser internet uniquement lorsque la recherche web est activee.',
        help: 'Je peux vous aider a trouver, expliquer, resumer et structurer les informations de la documentation du cours. Vous pouvez aussi demander une recherche web avec web_search ou "Busca en internet".',
        sourcesTitle: 'Sources internet'
    },
    ca: {
        unavailableTitle: 'Informacio no disponible en la documentacio',
        unavailableBody: 'No trobe en la documentacio disponible informacio suficient per a respondre amb seguretat a la consulta:',
        unavailableHint: 'Pot reformular la pregunta indicant el tema, modul, apartat o pagina concreta que vol consultar.',
        externalTitle: 'Fora de la documentacio disponible',
        externalBody: 'No puc respondre amb coneixement extern llevat que la cerca web estiga activada. La consulta no esta respaldada per la documentacio del curs:',
        externalHint: 'Si vol una resposta basada en internet, active web_search o incloga "Busca en internet" en la peticio.',
        smalltalk: 'Estic aci i preparat per a ajudar amb preguntes sobre la documentacio del curs.',
        identity: 'Soc un tutor especialitzat a respondre consultes basades en la documentacio del curs. Puc localitzar, explicar i resumir informacio d aquesta font, i nomes use internet quan la cerca web esta activada.',
        help: 'Puc ajudar a localitzar, explicar, resumir i estructurar informacio de la documentacio del curs. Tambe pot demanar cerca web activant web_search o incloent "Busca en internet".',
        sourcesTitle: 'Fonts d internet'
    },
    gl: {
        unavailableTitle: 'Informacion non disponibel na documentacion',
        unavailableBody: 'Non atopo na documentacion disponibel informacion suficiente para responder con seguridade a consulta:',
        unavailableHint: 'Pode reformular a pregunta indicando o tema, modulo, apartado ou paxina concreta que quere consultar.',
        externalTitle: 'Fora da documentacion disponibel',
        externalBody: 'Non podo responder con conecemento externo salvo que a busca web estea activada. A consulta non esta apoiada pola documentacion do curso:',
        externalHint: 'Se quere unha resposta baseada en internet, active web_search ou inclua "Busca en internet" na peticion.',
        smalltalk: 'Estou aqui e preparado para axudar con preguntas sobre a documentacion do curso.',
        identity: 'Son un titor especializado en responder consultas baseadas na documentacion do curso. Podo localizar, explicar e resumir informacion desa fonte, e so uso internet cando a busca web esta activada.',
        help: 'Podo axudar a localizar, explicar, resumir e estruturar informacion da documentacion do curso. Tamen pode pedir busca web activando web_search ou incluindo "Busca en internet".',
        sourcesTitle: 'Fontes de internet'
    },
    de: {
        unavailableTitle: 'Information in der Dokumentation nicht verfuegbar',
        unavailableBody: 'In der verfuegbaren Dokumentation finde ich nicht genug Informationen, um diese Anfrage sicher zu beantworten:',
        unavailableHint: 'Sie koennen die Frage mit Thema, Modul, Abschnitt oder konkreter Seite erneut formulieren.',
        externalTitle: 'Ausserhalb der verfuegbaren Dokumentation',
        externalBody: 'Ich kann nicht mit externem Wissen antworten, solange die Websuche nicht aktiviert ist. Die Anfrage wird nicht durch die Kursdokumentation gestuetzt:',
        externalHint: 'Wenn Sie eine internetgestuetzte Antwort moechten, aktivieren Sie web_search oder fuegen Sie "Busca en internet" hinzu.',
        smalltalk: 'Ich bin bereit, bei Fragen zur Kursdokumentation zu helfen.',
        identity: 'Ich bin ein Tutor, der auf Antworten anhand der Kursdokumentation spezialisiert ist. Ich kann Informationen aus dieser Quelle finden, erklaeren und zusammenfassen und nutze das Internet nur bei aktivierter Websuche.',
        help: 'Ich kann helfen, Informationen aus der Kursdokumentation zu finden, zu erklaeren, zusammenzufassen und zu strukturieren. Websuche ist mit web_search oder "Busca en internet" moeglich.',
        sourcesTitle: 'Internetquellen'
    },
    it: {
        unavailableTitle: 'Informazione non disponibile nella documentazione',
        unavailableBody: 'Non trovo nella documentazione disponibile informazioni sufficienti per rispondere con sicurezza alla richiesta:',
        unavailableHint: 'Puoi riformulare la domanda indicando tema, modulo, sezione o pagina concreta da consultare.',
        externalTitle: 'Fuori dalla documentazione disponibile',
        externalBody: 'Non posso rispondere con conoscenza esterna se la ricerca web non e attiva. La richiesta non e supportata dalla documentazione del corso:',
        externalHint: 'Se vuoi una risposta basata su internet, attiva web_search o includi "Busca en internet" nella richiesta.',
        smalltalk: 'Sono qui e pronto ad aiutarti con domande sulla documentazione del corso.',
        identity: 'Sono un tutor specializzato nel rispondere a domande basate sulla documentazione del corso. Posso trovare, spiegare e riassumere informazioni da quella fonte, e uso internet solo quando la ricerca web e attiva.',
        help: 'Posso aiutarti a trovare, spiegare, riassumere e strutturare informazioni dalla documentazione del corso. Puoi anche richiedere la ricerca web con web_search o "Busca en internet".',
        sourcesTitle: 'Fonti internet'
    }
};

const getLocalizedCopy = (responseLanguage = LANGUAGE_PROFILES.es) => (
    localizedCopy[responseLanguage.localeHint] || localizedCopy.en
);

export const createInsufficientContextResponse = (prompt, responseLanguage = detectResponseLanguage(prompt)) => {
    const question = escapeResponseText(prompt);
    const copy = getLocalizedCopy(responseLanguage);
    return `<section><h2>${copy.unavailableTitle}</h2><p>${copy.unavailableBody} <strong>${question}</strong>.</p><p>${copy.unavailableHint}</p></section>`;
};

export const createExternalKnowledgeResponse = (prompt, responseLanguage = detectResponseLanguage(prompt)) => {
    const question = escapeResponseText(prompt);
    const copy = getLocalizedCopy(responseLanguage);
    return `<section><h2>${copy.externalTitle}</h2><p>${copy.externalBody} <strong>${question}</strong>.</p><p>${copy.externalHint}</p></section>`;
};

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

export const classifyTutorPrompt = (prompt) => {
    const normalized = normalizeForDetection(stripExplicitLanguageInstruction(prompt));

    if (/\b(?:who|what)\s+(?:are|r)\s+(?:you|u)\b/i.test(normalized)
        || /\b(?:quien|que)\s+(?:eres|sos)(?:\s+tu)?\b/i.test(normalized)
        || /\bcual\s+es\s+tu\s+(?:rol|funcion|identidad)\b/i.test(normalized)) {
        return 'identity';
    }

    if (/\bwhat\s+can\s+(?:you|u)\s+do\b/i.test(normalized)
        || /\bhow\s+can\s+(?:you|u)\s+help\b/i.test(normalized)
        || /\b(?:que|q)\s+(?:puedes|podes|sabes)\s+hacer\b/i.test(normalized)
        || /\b(?:que|q)\s+haces\b/i.test(normalized)
        || /\bcomo\s+(?:funcionas|funciona|te\s+uso|usarte|puedo\s+usarte)\b/i.test(normalized)
        || /\b(?:que|q)\s+puedo\s+preguntarte\b/i.test(normalized)) {
        return 'help';
    }

    if (/^(?:hi|hello|hey|hola|buenas|ol[aá]|oi|bonjour|salut|ciao|hallo)(?:[!.? ]+)?$/i.test(normalized)
        || /\b(?:how are u|how are you|como estas|como esta|comment ca va|comment allez vous|come stai|wie geht)\b/i.test(normalized)
        || /^(?:thanks|thank you|gracias|obrigad[oa]|merci|danke|grazie)\b/i.test(normalized)
        || /^(?:bye|goodbye|adios|adeus|au revoir|ciao)\b/i.test(normalized)) {
        return 'smalltalk';
    }

    if (/\b(?:who are you|what are you|quien eres|que eres|qual es|qual e|quem es|qui es tu|wer bist du|chi sei|identidad|funcion|funcao)\b/i.test(normalized)) {
        return 'identity';
    }

    if (/\b(?:what can you do|how can you help|como me puedes ayudar|que puedes hacer|que sabes hacer|como podes ajudar|comment peux tu aider|was kannst du|cosa puoi fare|ayuda|help)\b/i.test(normalized)) {
        return 'help';
    }

    if (/^(?:eso|esto|aquello|lo\s+anterior|el\s+anterior|la\s+anterior|el\s+segundo|el\s+primero|el\s+punto|ese\s+punto|esa\s+parte|that|this|the\s+previous|the\s+second|the\s+first)\b/i.test(normalized)) {
        return 'ambiguous';
    }

    if (isStructuralQuestion(prompt)
        || /\b(?:documentacion|documentation|documentacao|documentacio|documentazione|dokumentation|curso|course|cours|corso|kurs|modulo|module|tema|unidad|unit|section|seccion|apartado|pagina|page|manual|qdrant|contenido|content|material|resumen|summary|exam|examen|exercise|ejercicio)\b/i.test(normalized)) {
        return 'course_documentary';
    }

    if (/\b(?:capital|president|presidente|weather|clima|today|actualidad|news|noticias|define|definition|what is|who is|when is|where is|cuanto es|calculate|calcula|programming|javascript|python)\b/i.test(normalized)) {
        return 'external_knowledge';
    }

    return 'course_documentary';
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

const getInstructions = async ({ curso, context, responseLanguage = LANGUAGE_PROFILES.es }) => {
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

    const languageRule = `

RESPONSE LANGUAGE

Reply in: ${responseLanguage.languageName}.
If the user mixes languages, keep this response language unless the user explicitly requests another language.
Always keep the response as valid HTML.`;

    const ragRule = context.includes('MEMORIA DOCUMENTAL DE LA COLECCION QDRANT')
        ? `

REGLA PRIORITARIA RAG DOCUMENTAL

Para cualquier pregunta sin busqueda web, responde exclusivamente desde el contexto recuperado de Qdrant.
No uses conocimiento externo ni el historial para completar huecos. El historial solo sirve para resolver referencias del usuario y siempre queda subordinado al contexto documental actual.
Si el contexto recuperado no respalda una afirmacion, no la afirmes: indica que esa informacion no aparece en la documentacion disponible o pide precision si la pregunta es ambigua.`
        : '';

    if (!context.includes('ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION')) {
        return `${instructions}${languageRule}${ragRule}`;
    }

    return `${instructions}${languageRule}${ragRule}

REGLA PRIORITARIA SOBRE ESTRUCTURA DE CURSO

Si el contexto incluye el bloque "ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION", usalo como fuente preferente para responder preguntas sobre numero o listado de modulos, unidades formativas, practicas, manuales, contenidos, horas o estructura del curso.
No digas que solo existe un modulo, unidad o manual basandote en fragmentos vectoriales parciales si ese bloque contiene un listado mas completo.
Las practicas MP deben distinguirse de los modulos formativos MF, salvo que el usuario pida incluir todo.`;
};

const getWebInstructions = async ({ curso, context, responseLanguage = LANGUAGE_PROFILES.es }) => {
    const instructions = await getInstructions({ curso, context, responseLanguage });
    return `${instructions}

BUSQUEDA EXTERNA ACTIVADA

Debes complementar el contexto oficial con una busqueda en internet.
Indica claramente que informacion procede de internet y cual procede del contexto oficial.
Responde exclusivamente con HTML valido, sin Markdown.
No anadas una seccion de fuentes: el sistema la incorporara automaticamente.`;
};

export const getWebResponse = async ({
    curso,
    context,
    prompt,
    history = [],
    responseLanguage = detectResponseLanguage(prompt),
    perplexityClient = perplexity
}) => {
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
                { role: 'system', content: await getWebInstructions({ curso, context, responseLanguage }) },
                ...history,
                { role: 'user', content: prompt }
            ]
        });
        const sources = normalizeWebSources({
            citations: chatCompletion.citations,
            searchResults: chatCompletion.search_results
        });
        const responseHtml = normalizeAssistantHtml(chatCompletion.choices[0]?.message?.content);

        return {
            respuesta: appendWebSourcesHtml(responseHtml, sources, responseLanguage),
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
                respuesta: createInsufficientContextResponse(cleanPrompt, responseLanguage),
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
            history: normalizedHistory,
            responseLanguage
        });
    }

    const systemInstruction = await getInstructions({ curso, context, responseLanguage });
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
        respuesta: normalizeAssistantHtml(chatCompletion.choices[0].message.content),
        webSearchUsed: false,
        sources: []
    };
};
