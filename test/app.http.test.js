import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'legacy';
delete process.env.API_KEY;
process.env.CORS_ALLOWED_ORIGINS = 'https://frontend.test';
process.env.OPENAI_API_KEY ||= 'test-not-used';
process.env.QDRANT_URL ||= 'http://127.0.0.1:6333';

const { createApp } = await import('../src/app.js');

let server;
let baseUrl;

before(async () => {
    server = createApp().listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
});

test('expone cabeceras de seguridad y no revela Express', async () => {
    const response = await fetch(`${baseUrl}/api/tutor/unknown`);

    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);
});

test('resuelve preflight CORS antes de autenticacion', async () => {
    const response = await fetch(`${baseUrl}/api/tutor/conversations`, {
        method: 'OPTIONS',
        headers: {
            origin: 'https://frontend.test',
            'access-control-request-method': 'POST'
        }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://frontend.test');
});

test('rechaza un origen no permitido', async () => {
    const response = await fetch(`${baseUrl}/api/tutor/conversations`, {
        headers: { origin: 'https://attacker.test', 'x-user-id': 'test-user' }
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Origen no permitido.' });
});

test('devuelve error estable para JSON malformado', async () => {
    const response = await fetch(`${baseUrl}/api/tutor/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': 'test-user' },
        body: '{invalid'
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'JSON invalido.' });
});

test('valida el contrato antes de acceder a persistencia', async () => {
    const response = await fetch(`${baseUrl}/api/tutor/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.errors.some(error => error.field === 'x-user-id'));
    assert.ok(body.errors.some(error => error.field === 'course id'));
    assert.ok(body.errors.some(error => error.field === 'curso'));
    assert.ok(body.errors.some(error => error.field === 'vs_id_QDRANT'));
});
