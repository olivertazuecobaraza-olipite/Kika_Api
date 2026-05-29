import { timingSafeEqual } from 'crypto';

const API_KEY_HEADER = 'x-api-key';

const safeCompare = (received, expected) => {
    if (!received || !expected) return false;

    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    if (receivedBuffer.length !== expectedBuffer.length) return false;

    return timingSafeEqual(receivedBuffer, expectedBuffer);
};

export const requireApiKey = (req, res, next) => {
    const expectedApiKey = process.env.API_KEY;

    if (!expectedApiKey) {
        if (process.env.NODE_ENV === 'production') {
            return res.status(500).json({ error: 'API no configurada correctamente.' });
        }
        return next();
    }

    const receivedApiKey = req.get(API_KEY_HEADER);
    if (!safeCompare(receivedApiKey, expectedApiKey)) {
        return res.status(401).json({ error: 'No autorizado.' });
    }

    next();
};
