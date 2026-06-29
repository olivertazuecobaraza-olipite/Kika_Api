import jwt from 'jsonwebtoken';
import { parseAuthConfig } from '../config/auth.js';
import { findActiveLicense } from './license-registry.service.js';
import { isTokenRevoked } from './token-revocation.service.js';

const JWT_STATUS_CACHE_TTL_MS = Number(process.env.JWT_STATUS_CACHE_TTL_MS || 30_000);
const jwtStatusCache = new Map();

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

export const clearJwtStatusCache = () => {
    jwtStatusCache.clear();
};

const getCachedTokenStatus = async ({ jti, activeLicenseFinder, revocationChecker, cacheTokenStatus }) => {
    const cacheEnabled = JWT_STATUS_CACHE_TTL_MS > 0
        && (
            cacheTokenStatus === true
            || activeLicenseFinder === findActiveLicense && revocationChecker === isTokenRevoked
        );
    const now = Date.now();

    if (cacheEnabled) {
        const cached = jwtStatusCache.get(jti);
        if (cached && now < cached.expiresAt) {
            return cached.value;
        }
    }

    const [activeLicense, revoked] = await Promise.all([
        activeLicenseFinder(jti),
        revocationChecker(jti)
    ]);
    const value = { activeLicense, revoked };

    if (cacheEnabled) {
        jwtStatusCache.set(jti, {
            value,
            expiresAt: now + JWT_STATUS_CACHE_TTL_MS
        });
    }

    return value;
};

export const verifyApiToken = async (
    token,
    {
        config = parseAuthConfig(),
        activeLicenseFinder = findActiveLicense,
        revocationChecker = isTokenRevoked,
        cacheTokenStatus = false
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

        const hasExp = Object.hasOwn(payload, 'exp');
        if (hasExp) {
            requireNumber(payload, 'exp');
        }

        const now = Math.floor(Date.now() / 1000);
        if (
            payload.iat > now + config.clockToleranceSeconds
            || (
                hasExp
                && (
                    payload.exp <= payload.iat
                    || payload.exp - payload.iat > config.maxTtlSeconds
                )
            )
        ) {
            throw new AuthenticationError();
        }

        let tokenStatus;
        try {
            tokenStatus = await getCachedTokenStatus({
                jti: payload.jti,
                activeLicenseFinder,
                revocationChecker,
                cacheTokenStatus
            });
        } catch {
            throw new AuthenticationUnavailableError();
        }
        const { activeLicense, revoked } = tokenStatus;
        const licenseNeverExpires = activeLicense?.expiresAt == null;
        const tokenExpirationMatches = hasExp
            ? !licenseNeverExpires
                && Math.floor(new Date(activeLicense.expiresAt).getTime() / 1000) === payload.exp
            : licenseNeverExpires;
        if (
            !activeLicense
            || activeLicense.subject !== payload.sub
            || activeLicense.keyId !== kid
            || !tokenExpirationMatches
            || revoked
        ) {
            throw new AuthenticationError();
        }

        return {
            type: 'jwt',
            subject: payload.sub,
            tokenId: payload.jti,
            issuedAt: payload.iat,
            expiresAt: hasExp ? payload.exp : null,
            keyId: kid
        };
    } catch (error) {
        if (error instanceof AuthenticationUnavailableError || error instanceof AuthenticationError) {
            throw error;
        }
        throw new AuthenticationError();
    }
};
