import jwt from 'jsonwebtoken';
import { parseAuthConfig } from '../config/auth.js';
import { findActiveLicense } from './license-registry.service.js';
import { isTokenRevoked } from './token-revocation.service.js';

export class AuthenticationError extends Error {
    constructor(message = 'No autorizado.') {
        super(message);
        this.name = 'AuthenticationError';
        this.status = 401;
    }
}

export class AuthenticationUnavailableError extends Error {
    constructor(message = 'No se pudo comprobar la autorizacion.') {
        super(message);
        this.name = 'AuthenticationUnavailableError';
        this.status = 503;
    }
}

const requireString = (payload, claim) => {
    if (typeof payload[claim] !== 'string' || !payload[claim].trim()) {
        throw new AuthenticationError();
    }
};

const requireNumber = (payload, claim) => {
    if (!Number.isInteger(payload[claim])) {
        throw new AuthenticationError();
    }
};

export const verifyApiToken = async (
    token,
    {
        config = parseAuthConfig(),
        activeLicenseFinder = findActiveLicense,
        revocationChecker = isTokenRevoked
    } = {}
) => {
    try {
        const decoded = jwt.decode(token, { complete: true });
        const kid = decoded?.header?.kid;

        if (decoded?.header?.alg !== 'RS256' || decoded?.header?.typ !== 'JWT' || typeof kid !== 'string' || !kid) {
            throw new AuthenticationError();
        }

        const publicKey = config.publicKeys?.[kid];
        if (!publicKey) {
            throw new AuthenticationError();
        }

        const payload = jwt.verify(token, publicKey, {
            algorithms: ['RS256'],
            issuer: config.issuer,
            audience: config.audience,
            clockTolerance: config.clockToleranceSeconds
        });

        requireString(payload, 'sub');
        requireString(payload, 'jti');
        requireNumber(payload, 'iat');
        requireNumber(payload, 'exp');

        const now = Math.floor(Date.now() / 1000);
        if (
            payload.iat > now + config.clockToleranceSeconds
            || payload.exp <= payload.iat
            || payload.exp - payload.iat > config.maxTtlSeconds
        ) {
            throw new AuthenticationError();
        }

        let activeLicense;
        let revoked;
        try {
            activeLicense = await activeLicenseFinder(payload.jti);
            revoked = await revocationChecker(payload.jti);
        } catch {
            throw new AuthenticationUnavailableError();
        }
        if (
            !activeLicense
            || activeLicense.subject !== payload.sub
            || activeLicense.keyId !== kid
            || Math.floor(new Date(activeLicense.expiresAt).getTime() / 1000) !== payload.exp
            || revoked
        ) {
            throw new AuthenticationError();
        }

        return {
            type: 'jwt',
            subject: payload.sub,
            tokenId: payload.jti,
            issuedAt: payload.iat,
            expiresAt: payload.exp,
            keyId: kid
        };
    } catch (error) {
        if (error instanceof AuthenticationUnavailableError || error instanceof AuthenticationError) {
            throw error;
        }
        throw new AuthenticationError();
    }
};
