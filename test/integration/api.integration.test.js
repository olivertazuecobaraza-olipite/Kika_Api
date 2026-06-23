import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const mongoUri = process.env.TEST_MONGO_URI || '';
const qdrantUrl = process.env.TEST_QDRANT_URL || '';
const hasSafeMongo = /(?:^|[/_-])test(?:$|[?/_-])/i.test(mongoUri);

if (mongoUri && !hasSafeMongo) {
    throw new Error('TEST_MONGO_URI debe identificar explicitamente una base de test.');
}

process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'legacy';
delete process.env.API_KEY;
process.env.MONGO_URI = mongoUri;
process.env.QDRANT_URL = qdrantUrl || 'http://127.0.0.1:6333';
process.env.OPENAI_API_KEY ||= 'test-not-used';
process.env.QDRANT_VECTOR_SIZE = '4';

let server;
let baseUrl;
let Conversation;
let Message;
let QdrantCollection;
let qdrantClient;
let providerServer;
const pendingQdrantCollections = new Set();

const startProviderStub = async () => {
    providerServer = createServer((req, res) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const payload = JSON.parse(Buffer.concat(chunks).toString() || '{}');
            res.setHeader('content-type', 'application/json');
            if (req.url === '/embeddings') {
                const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
                res.end(JSON.stringify({
                    object: 'list',
                    model: payload.model,
                    data: inputs.map((_, index) => ({
                        object: 'embedding', index, embedding: [1, 0, 0, 0]
                    })),
                    usage: { prompt_tokens: 1, total_tokens: 1 }
                }));
                return;
            }
            if (req.url === '/chat/completions') {
                res.end(JSON.stringify({
                    id: 'chatcmpl-test',
                    object: 'chat.completion',
                    created: 0,
                    model: payload.model,
                    choices: [{
                        index: 0,
                        finish_reason: 'stop',
                        message: {
                            role: 'assistant',
                            content: '<section><p>Respuesta integrada basada en el documento.</p></section>'
                        }
                    }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
                }));
                return;
            }
            res.statusCode = 404;
            res.end(JSON.stringify({ error: { message: 'Ruta simulada no encontrada' } }));
        });
    }).listen(0, '127.0.0.1');
    await new Promise(resolve => providerServer.once('listening', resolve));
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${providerServer.address().port}`;
};

before(async () => {
    if (!mongoUri) return;

    await startProviderStub();
    await mongoose.connect(mongoUri);
    ({ Conversation } = await import('../../src/models/conversation.model.js'));
    ({ Message } = await import('../../src/models/message.model.js'));
    ({ QdrantCollection } = await import('../../src/models/qdrant-collection.model.js'));
    if (qdrantUrl) {
        const { QdrantClient } = await import('@qdrant/js-client-rest');
        qdrantClient = new QdrantClient({ url: qdrantUrl });
    }
    const { createApp } = await import('../../src/app.js');
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (!mongoUri) return;
    if (qdrantClient) {
        for (const collectionName of pendingQdrantCollections) {
            try {
                await qdrantClient.deleteCollection(collectionName);
            } catch {
                // La coleccion ya puede haber sido eliminada por el propio test.
            }
        }
    }
    await Promise.all([
        Conversation.deleteMany({ userId: /^integration-/ }),
        QdrantCollection.deleteMany({ collectionName: /^kika_test_/ })
    ]);
    if (server) await new Promise(resolve => server.close(resolve));
    if (providerServer) await new Promise(resolve => providerServer.close(resolve));
    await mongoose.disconnect();
});

test('ciclo HTTP de conversaciones persiste, aisla y elimina mensajes', { skip: !mongoUri }, async () => {
    const userId = `integration-${randomUUID()}`;
    const otherUserId = `integration-${randomUUID()}`;
    const headers = { 'content-type': 'application/json', 'x-user-id': userId };

    const createdResponse = await fetch(`${baseUrl}/api/tutor/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            'course id': 'course_test',
            curso: 'CURSO_TEST',
            vs_id_QDRANT: 'kika_test_documents',
            title: 'Conversacion integrada'
        })
    });
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 201);
    assert.match(created.conversation_id, /^[a-f\d]{24}$/);

    await Message.create({
        conversationId: created.conversation_id,
        role: 'user',
        content: 'Mensaje persistido'
    });

    const listResponse = await fetch(`${baseUrl}/api/tutor/conversations?course_id=course_test`, { headers });
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.conversations.length, 1);

    const hiddenResponse = await fetch(`${baseUrl}/api/tutor/conversations/${created.conversation_id}/messages`, {
        headers: { 'x-user-id': otherUserId }
    });
    assert.equal(hiddenResponse.status, 404);

    const messagesResponse = await fetch(`${baseUrl}/api/tutor/conversations/${created.conversation_id}/messages`, { headers });
    const messages = await messagesResponse.json();
    assert.equal(messagesResponse.status, 200);
    assert.deepEqual(messages.messages.map(message => message.content), ['Mensaje persistido']);

    const renamedResponse = await fetch(`${baseUrl}/api/tutor/conversations/${created.conversation_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: 'Titulo nuevo' })
    });
    assert.equal(renamedResponse.status, 200);
    assert.equal((await renamedResponse.json()).title, 'Titulo nuevo');

    const deletedResponse = await fetch(`${baseUrl}/api/tutor/conversations/${created.conversation_id}`, {
        method: 'DELETE', headers
    });
    assert.equal(deletedResponse.status, 204);
    assert.equal(await Message.countDocuments({ conversationId: created.conversation_id }), 0);
});

test('crea, lista y elimina una coleccion en Qdrant real', { skip: !mongoUri || !qdrantUrl }, async () => {
    const collectionName = `kika_test_${randomUUID().replaceAll('-', '_')}`;
    pendingQdrantCollections.add(collectionName);
    const headers = { 'content-type': 'application/json' };

    const createdResponse = await fetch(`${baseUrl}/api/tutor/qdrant/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            collection_name: collectionName,
            display_name: 'Integracion',
            course_id: 'course_test',
            curso: 'CURSO_TEST'
        })
    });
    assert.equal(createdResponse.status, 201, await createdResponse.text());

    const listResponse = await fetch(`${baseUrl}/api/tutor/qdrant/collections?search=${collectionName}`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.total, 1);

    const documentText = [
        'DOCUMENTO DE PRUEBA INTEGRADA.',
        'El protocolo KIKA_TEST indica que el paso obligatorio es validar la caja antes del cobro.'
    ].join(' ').repeat(12);
    const form = new FormData();
    form.append('file', new Blob([documentText], { type: 'text/plain' }), 'manual-integracion.txt');
    form.append('course_id', 'course_test');
    form.append('curso', 'CURSO_TEST');
    const uploadResponse = await fetch(`${baseUrl}/api/tutor/qdrant/collections/${collectionName}/files`, {
        method: 'POST', body: form
    });
    const upload = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201, JSON.stringify(upload));
    assert.equal(upload.uploaded.file_name, 'manual-integracion.txt');
    assert.ok(upload.uploaded.chunks >= 1);

    const filesResponse = await fetch(`${baseUrl}/api/tutor/qdrant/collections/${collectionName}/files`);
    const files = await filesResponse.json();
    assert.equal(filesResponse.status, 200);
    assert.equal(files.files.length, 1);

    const tutorResponse = await fetch(`${baseUrl}/api/tutor/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            'course id': 'course_test',
            curso: 'CURSO_TEST',
            vs_id_QDRANT: collectionName,
            prompt: 'Segun el documento, que paso es obligatorio antes del cobro?'
        })
    });
    const tutor = await tutorResponse.json();
    assert.equal(tutorResponse.status, 200, JSON.stringify(tutor));
    assert.match(tutor.respuesta, /Respuesta integrada|contexto/i);

    const deleteFileResponse = await fetch(
        `${baseUrl}/api/tutor/qdrant/collections/${collectionName}/files/${upload.uploaded.file_id}`,
        { method: 'DELETE' }
    );
    assert.equal(deleteFileResponse.status, 200, await deleteFileResponse.text());

    const deletedResponse = await fetch(`${baseUrl}/api/tutor/qdrant/collections/${collectionName}?confirm=true`, {
        method: 'DELETE'
    });
    assert.equal(deletedResponse.status, 200, await deletedResponse.text());
    pendingQdrantCollections.delete(collectionName);
});
