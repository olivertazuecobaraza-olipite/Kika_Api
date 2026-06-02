import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { parseAuthConfig } from '../src/config/auth.js';

const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const validJwtEnvironment = {
    AUTH_MODE: 'jwt',
    JWT_ISSUER: 'test-issuer',
    JWT_AUDIENCE: 'test-audience',
    JWT_PUBLIC_KEYS_JSON: JSON.stringify({
        current: Buffer.from(publicKey).toString('base64')
    })
};

test('usa legacy como modo predeterminado', () => {
    assert.equal(parseAuthConfig({}).mode, 'legacy');
});

test('carga claves publicas JWT por kid', () => {
    const config = parseAuthConfig(validJwtEnvironment);
    assert.equal(config.mode, 'jwt');
    assert.equal(config.issuer, 'test-issuer');
    assert.equal(config.audience, 'test-audience');
    assert.equal(config.publicKeys.current, publicKey);
});

test('rechaza modos, TTL y configuraciones JWT invalidas', () => {
    assert.throws(() => parseAuthConfig({ AUTH_MODE: 'unknown' }));
    assert.throws(() => parseAuthConfig({ ...validJwtEnvironment, JWT_MAX_TTL_SECONDS: '31622401' }));
    assert.throws(() => parseAuthConfig({ ...validJwtEnvironment, JWT_CLOCK_TOLERANCE_SECONDS: '-1' }));
    assert.throws(() => parseAuthConfig({ ...validJwtEnvironment, JWT_PUBLIC_KEYS_JSON: '{}' }));
    assert.throws(() => parseAuthConfig({ ...validJwtEnvironment, JWT_PUBLIC_KEYS_JSON: '{"current":"invalid"}' }));
});
