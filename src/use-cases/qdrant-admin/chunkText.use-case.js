const CHUNK_SIZE = Number(process.env.QDRANT_CHUNK_SIZE || 1200);
const CHUNK_OVERLAP = Number(process.env.QDRANT_CHUNK_OVERLAP || 150);

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const chunkText = (text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) => {
    const normalized = normalizeText(text);
    if (!normalized) return [];

    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
        const end = Math.min(start + chunkSize, normalized.length);
        chunks.push(normalized.slice(start, end).trim());
        if (end === normalized.length) break;
        start = Math.max(end - overlap, start + 1);
    }
    return chunks.filter(Boolean);
};
