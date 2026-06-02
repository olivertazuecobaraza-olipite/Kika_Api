import { createPublicKey } from 'node:crypto';

export const AUTH_MODES = ['legacy', 'hybrid', 'jwt'];
export const DEFAULT_JWT_MAX_TTL_SECONDS = 31622400;
export const ABSOLUTE_JWT_MAX_TTL_SECONDS = 31622400;
export const DEFAULT_JWT_CLOCK_TOLERANCE_SECONDS = 30;

const parsePositiveInteger = (value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
        throw new Error(`${name} debe ser un entero positivo y no superar ${maximum}.`);
    }
    return parsed;
};

const parseNonNegativeInteger = (value, fallback, name) => {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${name} debe ser un entero mayor o igual que cero.`);
    }
    return parsed;
};

const decodePublicKey = (encodedKey, kid) => {
    if (typeof encodedKey !== 'string' || !encodedKey.trim()) {
        throw new Error(`La clave publica JWT para kid "${kid}" no es valida.`);
    }

    const publicKey = Buffer.from(encodedKey, 'base64').toString('utf8');
    if (!publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
        throw new Error(`La clave publica JWT para kid "${kid}" debe ser un PEM publico codificado en base64.`);
    }

    try {
        createPublicKey(publicKey);
    } catch {
        throw new Error(`La clave publica JWT para kid "${kid}" no se puede utilizar.`);
    }

    return publicKey;
};

const parsePublicKeys = (value) => {
    let parsed;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error('JWT_PUBLIC_KEYS_JSON debe contener un objeto JSON valido.');
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('JWT_PUBLIC_KEYS_JSON debe contener un mapa kid -> clave publica.');
    }

    const publicKeys = {};
    for (const [kid, encodedKey] of Object.entries(parsed)) {
        if (!kid.trim()) {
            throw new Error('JWT_PUBLIC_KEYS_JSON contiene un kid vacio.');
        }
        publicKeys[kid] = decodePublicKey(encodedKey, kid);
    }

    if (Object.keys(publicKeys).length === 0) {
        throw new Error('JWT_PUBLIC_KEYS_JSON debe contener al menos una clave publica.');
    }

    return publicKeys;
};

export const parseAuthConfig = (environment = process.env) => {
    const mode = environment.AUTH_MODE || 'legacy';
    if (!AUTH_MODES.includes(mode)) {
        throw new Error(`AUTH_MODE debe ser uno de: ${AUTH_MODES.join(', ')}.`);
    }

    const config = {
        mode,
        apiKey: environment.API_KEY,
        maxTtlSeconds: parsePositiveInteger(
            environment.JWT_MAX_TTL_SECONDS,
            DEFAULT_JWT_MAX_TTL_SECONDS,
            'JWT_MAX_TTL_SECONDS',
            ABSOLUTE_JWT_MAX_TTL_SECONDS
        ),
        clockToleranceSeconds: parseNonNegativeInteger(
            environment.JWT_CLOCK_TOLERANCE_SECONDS,
            DEFAULT_JWT_CLOCK_TOLERANCE_SECONDS,
            'JWT_CLOCK_TOLERANCE_SECONDS'
        )
    };

    if (mode === 'hybrid' || mode === 'jwt') {
        const missingVars = ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_PUBLIC_KEYS_JSON']
            .filter(name => !environment[name]);
        if (missingVars.length > 0) {
            throw new Error(`Faltan variables JWT requeridas: ${missingVars.join(', ')}`);
        }

        config.issuer = environment.JWT_ISSUER;
        config.audience = environment.JWT_AUDIENCE;
        config.publicKeys = parsePublicKeys(environment.JWT_PUBLIC_KEYS_JSON);
    }

    return config;
};
