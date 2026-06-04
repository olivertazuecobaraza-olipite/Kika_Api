import assert from 'node:assert/strict';
import test from 'node:test';
import { cors } from '../src/middlewares/cors.middleware.js';

const originalAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

const invoke = ({ method = 'GET', origin } = {}) => {
    const headers = {};
    const req = {
        method,
        get: name => name.toLowerCase() === 'origin' ? origin : undefined
    };
    const response = { statusCode: null, body: null };
    const res = {
        set(values) {
            Object.assign(headers, values);
            return this;
        },
        vary(name) {
            headers.Vary = name;
            return this;
        },
        sendStatus(code) {
            response.statusCode = code;
            return this;
        },
        status(code) {
            response.statusCode = code;
            return this;
        },
        json(body) {
            response.body = body;
            return this;
        }
    };
    let nextCalled = false;
    cors(req, res, () => { nextCalled = true; });
    return { headers, response, nextCalled };
};

test.afterEach(() => {
    if (originalAllowedOrigins === undefined) {
        delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
        process.env.CORS_ALLOWED_ORIGINS = originalAllowedOrigins;
    }
});

test('responde al preflight de un origen permitido antes de autenticar', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://moodle.example';
    const result = invoke({ method: 'OPTIONS', origin: 'https://moodle.example' });

    assert.equal(result.response.statusCode, 204);
    assert.equal(result.nextCalled, false);
    assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://moodle.example');
    assert.match(result.headers['Access-Control-Allow-Headers'], /Authorization/);
});

test('rechaza un origen no configurado', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://moodle.example';
    const result = invoke({ origin: 'https://otro.example' });

    assert.equal(result.response.statusCode, 403);
    assert.deepEqual(result.response.body, { error: 'Origen no permitido.' });
    assert.equal(result.nextCalled, false);
});

test('permite peticiones internas sin cabecera origin', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    assert.equal(invoke().nextCalled, true);
});
