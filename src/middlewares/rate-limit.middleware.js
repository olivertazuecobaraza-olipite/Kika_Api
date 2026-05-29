const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 30);
const buckets = new Map();

export const rateLimit = (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return next();
    }

    bucket.count += 1;
    if (bucket.count > MAX_REQUESTS) {
        res.set('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
        return res.status(429).json({ error: 'Demasiadas solicitudes.' });
    }

    next();
};

setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) {
            buckets.delete(key);
        }
    }
}, WINDOW_MS).unref();
