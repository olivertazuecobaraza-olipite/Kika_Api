import { isStructuralQuestion } from './isStructuralQuestion.use-case.js';

const normalizeForDetection = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[^\w\s?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripExplicitLanguageInstruction = (prompt) => String(prompt || '')
    .replace(/^\s*(?:respond|reply|answer)\s+in\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .replace(/^\s*(?:responde|contesta|contestame|contéstame|responder)\s+en\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .replace(/^\s*(?:responda|responde|contesta)\s+em\s+[a-záéíóúàèìòùâêîôûãõçñü]+\s*:?\s*/i, '')
    .trim();

export const classifyTutorPrompt = (prompt) => {
    const normalized = normalizeForDetection(stripExplicitLanguageInstruction(prompt));

    if (/\b(?:who|what)\s+(?:are|r)\s+(?:you|u)\b/i.test(normalized)
        || /\b(?:quien|que)\s+(?:eres|sos)(?:\s+tu)?\b/i.test(normalized)
        || /\bcual\s+es\s+tu\s+(?:rol|funcion|identidad)\b/i.test(normalized)
        || /\b(?:identidad|funcion|funcao)\b/i.test(normalized)) {
        return 'identity';
    }

    if (/\bwhat\s+can\s+(?:you|u)\s+do\b/i.test(normalized)
        || /\bhow\s+can\s+(?:you|u)\s+help\b/i.test(normalized)
        || /\b(?:que|q)\s+(?:cosas\s+)?(?:puedes|podes|sabes)\s+hacer\b/i.test(normalized)
        || /\b(?:que|q)\s+haces\b/i.test(normalized)
        || /\b(?:con\s+que|que)\s+conocimientos\s+(?:cuentas|tienes)\b/i.test(normalized)
        || /\bcon\s+que\s+informacion\s+cuentas\b/i.test(normalized)
        || /\b(?:que|q)\s+sabes\b/i.test(normalized)
        || /\b(?:en\s+que|como)\s+me\s+(?:puedes|podes)\s+ayudar\b/i.test(normalized)
        || /\bcomo\s+(?:funcionas|funciona|te\s+uso|usarte|puedo\s+usarte|me\s+ayudas)\b/i.test(normalized)
        || /\b(?:que|q)\s+puedo\s+preguntarte\b/i.test(normalized)
        || /\b(?:ayuda|help)\b/i.test(normalized)) {
        return 'help';
    }

    if (/^(?:hi|hello|hey|hola|buenas|ola|oi|bonjour|salut|ciao|hallo)$/i.test(normalized)
        || /\b(?:how are u|how are you|como estas|como esta|comment ca va|comment allez vous|come stai|wie geht)\b/i.test(normalized)
        || /^(?:thanks|thank you|gracias|obrigad[oa]|merci|danke|grazie)(?:\s+(?:por\s+todo|muchas|muchisimas))?$/i.test(normalized)
        || /^(?:bye|goodbye|adios|hasta luego|nos vemos|adeus|au revoir|ciao)$/i.test(normalized)) {
        return 'smalltalk';
    }

    if (/^(?:eso|esto|aquello|lo\s+anterior|el\s+anterior|la\s+anterior|el\s+segundo|el\s+primero|el\s+punto|ese\s+punto|esa\s+parte|that|this|the\s+previous|the\s+second|the\s+first)\b/i.test(normalized)) {
        return 'ambiguous';
    }

    if (isStructuralQuestion(prompt)
        || /\b(?:documentacion|documentation|documentacao|documentacio|documentazione|dokumentation|curso|course|cours|corso|kurs|modulo|module|tema|unidad|unit|section|seccion|apartado|pagina|page|manual|qdrant|contenido|content|material|resumen|summary|exam|examen|exercise|ejercicio)\b/i.test(normalized)) {
        return 'course_documentary';
    }

    if (/\b(?:capital|president|presidente|weather|clima|today|actualidad|news|noticias|define|definition|what is|who is|when is|where is|cuanto es|calculate|calcula|programming|programacion|javascript|python)\b/i.test(normalized)) {
        return 'external_knowledge';
    }

    return 'course_documentary';
};
