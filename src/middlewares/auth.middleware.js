import { timingSafeEqual } from 'crypto';
import { getCachedAuthConfig } from '../config/auth.js';
import {
    AuthenticationUnavailableError,
    verifyApiToken
} from '../service/auth.service.js';
import { logPerf, markDuration, nowMs } from '../utils/perf.js';

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
    const perfStart = nowMs();
    let config;
    try {
        config = getCachedAuthConfig();
    } catch {
        logPerf('perf.auth', { path: req.originalUrl, status: 500, duration_ms: markDuration(perfStart) });
        return res.status(500).json({ error: 'API no configurada correctamente.' });
    }

    if (config.mode === 'legacy') {
        if (!authenticateLegacy(req, config.apiKey)) {
            logPerf('perf.auth', { path: req.originalUrl, mode: 'legacy', status: 401, duration_ms: markDuration(perfStart) });
            return res.status(401).json({ error: 'No autorizado.' });
        }
        req.auth = { type: 'legacy' };
        logPerf('perf.auth', { path: req.originalUrl, mode: 'legacy', status: 'ok', duration_ms: markDuration(perfStart) });
        return next();
    }

    const bearerToken = getBearerToken(req);
    if (bearerToken !== null) {
        try {
            req.auth = await verifyApiToken(bearerToken, { config });
            logPerf('perf.auth', { path: req.originalUrl, mode: config.mode, status: 'ok', duration_ms: markDuration(perfStart) });
            return next();
        } catch (error) {
            const status = error instanceof AuthenticationUnavailableError ? 503 : 401;
            logPerf('perf.auth', { path: req.originalUrl, mode: config.mode, status, duration_ms: markDuration(perfStart) });
            return res.status(status).json({
                error: status === 503 ? 'No se pudo comprobar la autorizacion.' : 'No autorizado.'
            });
        }
    }

    if (config.mode === 'hybrid' && authenticateLegacy(req, config.apiKey)) {
        req.auth = { type: 'legacy' };
        logPerf('perf.auth', { path: req.originalUrl, mode: 'hybrid-legacy', status: 'ok', duration_ms: markDuration(perfStart) });
        return next();
    }

    if (config.mode === 'hybrid' && !config.apiKey && process.env.NODE_ENV !== 'production') {
        logPerf('perf.auth', { path: req.originalUrl, mode: 'hybrid', status: 500, duration_ms: markDuration(perfStart) });
        return res.status(500).json({ error: 'API no configurada correctamente.' });
    }

    if (config.mode === 'jwt' || config.mode === 'hybrid') {
        logPerf('perf.auth', { path: req.originalUrl, mode: config.mode, status: 401, duration_ms: markDuration(perfStart) });
        return res.status(401).json({ error: 'No autorizado.' });
    }
};
