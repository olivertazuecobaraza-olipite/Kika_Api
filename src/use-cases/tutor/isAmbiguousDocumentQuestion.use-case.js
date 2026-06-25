const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const isAmbiguousDocumentQuestion = ({ prompt, explicitPages = [], lexicalChunks = [], structuralQuestion = false }) => {
    if (structuralQuestion || explicitPages.length > 0 || lexicalChunks.length > 0) return false;
    const normalized = normalizeText(prompt).toLowerCase();
    return /^(?:eso|esto|lo anterior|el anterior|la anterior|el segundo|el primero|el punto|ese punto|esa parte)\b/i.test(normalized);
};
