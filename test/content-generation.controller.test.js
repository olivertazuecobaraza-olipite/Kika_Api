import assert from 'node:assert/strict';
import test from 'node:test';

process.env.OPENAI_API_KEY ||= 'test-openai-api-key';

const { sendGenerationError } = await import('../src/controllers/content-generation.controller.js');

const createResponse = () => ({
    statusCode: null,
    payload: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.payload = payload;
        return this;
    }
});

test('mantiene errores publicos 4xx y 5xx del servicio de generacion', () => {
    const res = createResponse();
    const error = new Error('provider unavailable');
    error.status = 503;
    error.publicMessage = 'La busqueda en internet no esta configurada.';

    sendGenerationError(res, error);

    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.payload, {
        respuesta: 'Error: La busqueda en internet no esta configurada.',
        web_search_used: false,
        fuentes: []
    });
});

test('oculta errores inesperados como 500 generico', () => {
    const res = createResponse();

    sendGenerationError(res, new Error('internal detail'));

    assert.equal(res.statusCode, 500);
    assert.equal(res.payload.respuesta, 'Error: No se pudo generar una respuesta en este momento.');
});
