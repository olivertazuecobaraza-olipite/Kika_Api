import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { requireApiKey } from '../src/middlewares/auth.middleware.js';

const originalEnv = { ...process.env };
const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const jwtEnvironment = {
    JWT_ISSUER: 'test-issuer',
    JWT_AUDIENCE: 'test-audience',
    JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        primary: Buffer.from(keys.publicKey).toString('base64')
    })
};

const invoke = async (headers = {}) => {
    const req = { get: name => headers[name.toLowerCase()] };
    const response = { statusCode: null, body: null };
    const res = {
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
    await requireApiKey(req, res, () => { nextCalled = true; });
    return { req, response, nextCalled };
};

const resetEnv = () => {
    for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
};

test.afterEach(resetEnv);

test('legacy mantiene x-api-key y el bypass de desarrollo sin clave', async () => {
    process.env.AUTH_MODE = 'legacy';
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'legacy-secret';
    assert.equal((await invoke({ 'x-api-key': 'legacy-secret' })).nextCalled, true);
    assert.equal((await invoke({ 'x-api-key': 'wrong' })).response.statusCode, 401);

    process.env.NODE_ENV = 'development';
    delete process.env.API_KEY;
    assert.equal((await invoke()).nextCalled, true);
});

test('jwt rechaza x-api-key sin Bearer', async () => {
    Object.assign(process.env, jwtEnvironment, { AUTH_MODE: 'jwt', API_KEY: 'legacy-secret' });
    assert.equal((await invoke({ 'x-api-key': 'legacy-secret' })).response.statusCode, 401);
});

test('hybrid acepta legacy pero no hace fallback si recibe un Bearer invalido', async () => {
    Object.assign(process.env, jwtEnvironment, { AUTH_MODE: 'hybrid', API_KEY: 'legacy-secret' });
    assert.equal((await invoke({ 'x-api-key': 'legacy-secret' })).nextCalled, true);
    const result = await invoke({
        authorization: 'Bearer invalid-token',
        'x-api-key': 'legacy-secret'
    });
    assert.equal(result.response.statusCode, 401);
    assert.equal(result.nextCalled, false);
});

test('hybrid requiere configuracion JWT incluso en desarrollo', async () => {
    process.env.AUTH_MODE = 'hybrid';
    process.env.NODE_ENV = 'development';
    delete process.env.API_KEY;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_PUBLIC_KEYS_JSON;
    assert.equal((await invoke()).response.statusCode, 500);
});
