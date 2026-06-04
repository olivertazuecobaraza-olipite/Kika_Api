const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Authorization,Content-Type,X-User-Id';

const getAllowedOrigins = () => new Set(
    (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
);

export const cors = (req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next();

    const allowedOrigins = getAllowedOrigins();
    const allowAnyOrigin = allowedOrigins.has('*');
    if (!allowAnyOrigin && !allowedOrigins.has(origin)) {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    res.set({
        'Access-Control-Allow-Origin': allowAnyOrigin ? '*' : origin,
        'Access-Control-Allow-Methods': ALLOWED_METHODS,
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '600'
    });
    if (!allowAnyOrigin) {
        res.vary('Origin');
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }

    next();
};
