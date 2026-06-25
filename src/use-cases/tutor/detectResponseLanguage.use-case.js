import { LANGUAGE_PROFILES } from './_internal/localization.js';

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
