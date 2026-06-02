import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
    addCalendarMonths,
    generateLicenseToken,
    issueAndRegisterLicense,
    parseLicenseMonths
} from '../src/service/license-issuer.service.js';

const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const baseOptions = {
    privateKey,
    kid: 'primary',
    clientId: 'cliente_academia_norte',
    clientName: 'Academia Norte',
    clientEmail: 'administracion@academia.example',
    issuer: 'test-issuer',
    audience: 'test-audience',
    now: new Date('2026-01-31T12:00:00.000Z'),
    tokenId: 'generated-id'
};

test('acepta licencias de 1, 3, 6 y 12 meses', () => {
    for (const months of [1, 3, 6, 12]) {
        assert.equal(parseLicenseMonths(months), months);
    }
    assert.throws(() => parseLicenseMonths(0));
    assert.throws(() => parseLicenseMonths(13));
});

test('calcula expiracion por meses naturales', () => {
    assert.equal(
        addCalendarMonths(new Date('2026-01-31T12:00:00.000Z'), 1).toISOString(),
        '2026-02-28T12:00:00.000Z'
    );
});

test('genera JWT comercial sin guardar ni exponer la clave privada', () => {
    const result = generateLicenseToken({ ...baseOptions, months: 3 });
    const decoded = jwt.decode(result.token, { complete: true });
    assert.equal(decoded.header.kid, 'primary');
    assert.equal(decoded.payload.sub, 'cliente_academia_norte');
    assert.equal(decoded.payload.jti, 'generated-id');
    assert.equal(result.expiresAt.toISOString(), '2026-04-30T12:00:00.000Z');
});

test('registra la licencia y sustituye la anterior al renovar', async () => {
    const calls = [];
    const registry = {
        registerIssuedLicense: async license => calls.push(['register', license.jti]),
        supersedeLicense: async replacement => calls.push(['supersede', replacement])
    };

    await issueAndRegisterLicense({
        ...baseOptions,
        months: 6,
        replaceJti: 'previous-id',
        registry
    });

    assert.deepEqual(calls, [
        ['register', 'generated-id'],
        ['supersede', { previousJti: 'previous-id', replacementJti: 'generated-id' }]
    ]);
});
