import { timingSafeEqual } from 'crypto';
import { parseAuthConfig } from '../config/auth.js';
import {
    AuthenticationUnavailableError,
    verifyApiToken
} from '../service/auth.service.js';

const API_KEY_HEADER = 'x-api-key';

const safeCompare = (received, expected) => {
    if (!received || !expected) return false;

    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(receivedBuffer, expectedBuffer);
};

const authenticateLegacy = (req, expectedApiKey) => {
    if (!expectedApiKey) {
        return process.env.NODE_ENV !== 'production';
    }
    return safeCompare(req.get(API_KEY_HEADER), expectedApiKey);
};

const getBearerToken = (req) => {
    const authorization = req.get('authorization');
    if (!authorization) return null;

    const match = authorization.match(/^Bearer ([^\s]+)$/i);
    return match?.[1] || '';
};

export const requireApiKey = async (req, res, next) => {
    let config;
    try {
        config = parseAuthConfig();
    } catch {
        return res.status(500).json({ error: 'API no configurada correctamente.' });
    }

    if (config.mode === 'legacy') {
        if (!authenticateLegacy(req, config.apiKey)) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        req.auth = { type: 'legacy' };
        return next();
    }

    const bearerToken = getBearerToken(req);
    if (bearerToken !== null) {
        try {
            req.auth = await verifyApiToken(bearerToken, { config });
            return next();
        } catch (error) {
            const status = error instanceof AuthenticationUnavailableError ? 503 : 401;
            return res.status(status).json({
                error: status === 503 ? 'No se pudo comprobar la autorizacion.' : 'No autorizado.'
            });
        }
    }

    if (config.mode === 'hybrid' && authenticateLegacy(req, config.apiKey)) {
        req.auth = { type: 'legacy' };
        return next();
    }

    if (config.mode === 'hybrid' && !config.apiKey && process.env.NODE_ENV !== 'production') {
        return res.status(500).json({ error: 'API no configurada correctamente.' });
    }

    if (config.mode === 'jwt' || config.mode === 'hybrid') {
        return res.status(401).json({ error: 'No autorizado.' });
    }
};
