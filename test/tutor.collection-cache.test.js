import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deleteCollectionCache,
    deleteCollectionLoad,
    getCollectionCache,
    getCollectionLoad,
    setCollectionCache
} from '../src/use-cases/tutor/_internal/collection-cache.js';
import { invalidateCollectionCache } from '../src/use-cases/tutor/invalidateCollectionCache.use-case.js';

process.env.OPENAI_API_KEY ||= 'test-openai-api-key';
process.env.QDRANT_URL ||= 'http://127.0.0.1:6333';

const { openai } = await import('../src/config/openai.js');
const { qdrant } = await import('../src/config/qdrant.js');
const { getTutorResponse } = await import('../src/service/tutor.service.js');

test('invalidateCollectionCache elimina el estado singleton compartido', () => {
    const collectionName = `test-${Date.now()}`;
    const value = { timestamp: Date.now(), data: { files: [] } };

    setCollectionCache(collectionName, value);
    assert.equal(getCollectionCache(collectionName), value);

    invalidateCollectionCache(collectionName);
    assert.equal(getCollectionCache(collectionName), undefined);
    assert.equal(getCollectionLoad(collectionName), undefined);
    deleteCollectionCache(collectionName);
});

test('la carga fria de coleccion usa single-flight para requests concurrentes', async () => {
    const collectionName = `single-flight-${Date.now()}`;
    const originalEmbeddingCreate = openai.embeddings.create;
    const originalChatCreate = openai.chat.completions.create;
    const originalSearch = qdrant.search;
    const originalScroll = qdrant.scroll;
    let scrollCalls = 0;

    openai.embeddings.create = async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    openai.chat.completions.create = async () => ({
        choices: [{ message: { content: '<section><p>Respuesta</p></section>' } }]
    });
    qdrant.search = async () => ([{
        id: 'hit',
        score: 0.8,
        payload: { text: 'contenido del modulo de ventas', file_name: 'manual.pdf' }
    }]);
    qdrant.scroll = async () => {
        scrollCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return {
            points: [{
                id: 'page-1',
                payload: {
                    file_name: 'manual.pdf',
                    text: '<PARSED TEXT FOR PAGE: 1 / 1> contenido del modulo de ventas'
                }
            }],
            next_page_offset: undefined
        };
    };

    try {
        await Promise.all([
            getTutorResponse({ curso: 'curso', vsIdQdrant: collectionName, prompt: 'explica el modulo de ventas' }),
            getTutorResponse({ curso: 'curso', vsIdQdrant: collectionName, prompt: 'resume el modulo de ventas' })
        ]);

        assert.equal(scrollCalls, 1);
    } finally {
        openai.embeddings.create = originalEmbeddingCreate;
        openai.chat.completions.create = originalChatCreate;
        qdrant.search = originalSearch;
        qdrant.scroll = originalScroll;
        deleteCollectionLoad(collectionName);
        deleteCollectionCache(collectionName);
    }
});

test('la coleccion caliente no vuelve a hacer scroll en Qdrant', async () => {
    const collectionName = `hot-cache-${Date.now()}`;
    const originalEmbeddingCreate = openai.embeddings.create;
    const originalChatCreate = openai.chat.completions.create;
    const originalSearch = qdrant.search;
    const originalScroll = qdrant.scroll;
    let scrollCalls = 0;

    openai.embeddings.create = async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    openai.chat.completions.create = async () => ({
        choices: [{ message: { content: '<section><p>Respuesta</p></section>' } }]
    });
    qdrant.search = async () => ([{
        id: 'hit',
        score: 0.8,
        payload: { text: 'contenido sobre seguridad', file_name: 'manual.pdf' }
    }]);
    qdrant.scroll = async () => {
        scrollCalls += 1;
        return {
            points: [{
                id: 'page-1',
                payload: {
                    file_name: 'manual.pdf',
                    text: '<PARSED TEXT FOR PAGE: 1 / 1> contenido sobre seguridad'
                }
            }],
            next_page_offset: undefined
        };
    };

    try {
        await getTutorResponse({ curso: 'curso', vsIdQdrant: collectionName, prompt: 'explica seguridad' });
        await getTutorResponse({ curso: 'curso', vsIdQdrant: collectionName, prompt: 'resume seguridad' });

        assert.equal(scrollCalls, 1);
    } finally {
        openai.embeddings.create = originalEmbeddingCreate;
        openai.chat.completions.create = originalChatCreate;
        qdrant.search = originalSearch;
        qdrant.scroll = originalScroll;
        deleteCollectionLoad(collectionName);
        deleteCollectionCache(collectionName);
    }
});
