// src/config/qdrant.js
import { QdrantClient } from '@qdrant/js-client-rest';

const normalizeQdrantUrl = (url) => url?.replace(/\/collections\/?$/, '');

export const qdrant = new QdrantClient({
    url: normalizeQdrantUrl(process.env.QDRANT_URL),
    apiKey: process.env.QDRANT_API_KEY || undefined
});
