const RAG_MIN_CONTEXT_CHARS = Number(process.env.RAG_MIN_CONTEXT_CHARS || 500);
const RAG_MIN_VECTOR_SCORE = Number(process.env.RAG_MIN_VECTOR_SCORE || 0.68);

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
