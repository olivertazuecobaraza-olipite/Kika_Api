import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { verifyApiToken, AuthenticationUnavailableError } from '../src/service/auth.service.js';

const createKeyPair = () => generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const primaryKeys = createKeyPair();
const previousKeys = createKeyPair();
const now = Math.floor(Date.now() / 1000);
const config = {
    issuer: 'test-issuer',
    audience: 'test-audience',
    maxTtlSeconds: 31622400,
    clockToleranceSeconds: 0,
    publicKeys: {
        primary: primaryKeys.publicKey,
        previous: previousKeys.publicKey
    }
};

const sign = ({
    privateKey = primaryKeys.privateKey,
    kid = 'primary',
    issuer = config.issuer,
    audience = config.audience,
    algorithm = 'RS256',
    payload = {}
} = {}) => {
    const claims = {
        sub: 'app-campus',
        jti: 'token-id',
        iat: now,
        exp: now + 3600,
        ...payload
    };
    for (const [claim, value] of Object.entries(claims)) {
        if (value === undefined) delete claims[claim];
    }

    return jwt.sign(claims, privateKey, {
        algorithm,
        keyid: kid,
        issuer,
        audience,
        noTimestamp: Object.hasOwn(payload, 'iat') && payload.iat === undefined
    });
};

const verify = (token, overrides = {}) => verifyApiToken(token, {
    config,
    activeLicenseFinder: async () => ({
        subject: 'app-campus',
        keyId: 'primary',
        expiresAt: new Date((now + 3600) * 1000)
    }),
    revocationChecker: async () => false,
    ...overrides
});

test('acepta un JWT RS256 valido y expone la identidad autenticada', async () => {
    assert.deepEqual(await verify(sign()), {
        type: 'jwt',
        subject: 'app-campus',
        tokenId: 'token-id',
        issuedAt: now,
        expiresAt: now + 3600,
        keyId: 'primary'
    });
});

test('acepta una clave anterior mientras su kid siga configurado', async () => {
    const auth = await verify(sign({ privateKey: previousKeys.privateKey, kid: 'previous' }), {
        activeLicenseFinder: async () => ({
            subject: 'app-campus',
            keyId: 'previous',
            expiresAt: new Date((now + 3600) * 1000)
        })
    });
    assert.equal(auth.keyId, 'previous');
});

test('rechaza expiracion, kid, firma, audiencia y emisor invalidos', async () => {
    const otherKeys = createKeyPair();
    await assert.rejects(verify(sign({ payload: { exp: now - 60 } })));
    await assert.rejects(verify(sign({ kid: 'unknown' })));
    await assert.rejects(verify(sign({ privateKey: otherKeys.privateKey })));
    await assert.rejects(verify(sign({ audience: 'other-audience' })));
    await assert.rejects(verify(sign({ issuer: 'other-issuer' })));
});

test('rechaza tokens sin claims obligatorios o con TTL excesivo', async () => {
    for (const claim of ['sub', 'jti', 'iat', 'exp']) {
        await assert.rejects(verify(sign({ payload: { [claim]: undefined } })));
    }
    await assert.rejects(verify(sign({ payload: { exp: now + 31622401 } })));
    await assert.rejects(verify(sign({ payload: { iat: now + 60, exp: now + 3660 } })));
});

test('rechaza algoritmos diferentes de RS256', async () => {
    const token = jwt.sign(
        { sub: 'app-campus', jti: 'token-id', iat: now, exp: now + 3600, iss: config.issuer, aud: config.audience },
        'shared-secret',
        { algorithm: 'HS256', keyid: 'primary' }
    );
    await assert.rejects(verify(token));
});

test('rechaza tokens revocados y devuelve indisponibilidad si falla MongoDB', async () => {
    await assert.rejects(
        verifyApiToken(sign(), {
            config,
            activeLicenseFinder: async () => ({
                subject: 'app-campus',
                keyId: 'primary',
                expiresAt: new Date((now + 3600) * 1000)
            }),
            revocationChecker: async () => true
        })
    );
    await assert.rejects(
        verifyApiToken(sign(), {
            config,
            activeLicenseFinder: async () => { throw new Error('db down'); },
            revocationChecker: async () => false
        }),
        AuthenticationUnavailableError
    );
});

test('rechaza tokens firmados pero no registrados o con registro incoherente', async () => {
    await assert.rejects(verify(sign(), { activeLicenseFinder: async () => null }));
    await assert.rejects(verify(sign(), {
        activeLicenseFinder: async () => ({
            subject: 'otro-cliente',
            keyId: 'primary',
            expiresAt: new Date((now + 3600) * 1000)
        })
    }));
    await assert.rejects(verify(sign(), {
        activeLicenseFinder: async () => ({
            subject: 'app-campus',
            keyId: 'otro-kid',
            expiresAt: new Date((now + 3600) * 1000)
        })
    }));
    await assert.rejects(verify(sign(), {
        activeLicenseFinder: async () => ({
            subject: 'app-campus',
            keyId: 'primary',
            expiresAt: new Date((now + 7200) * 1000)
        })
    }));
});
