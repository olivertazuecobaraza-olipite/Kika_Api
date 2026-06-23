import express from 'express';
import tutorRoutes from './routes/tutor.routes.js';
import qdrantAdminRoutes from './routes/qdrant-admin.routes.js';
import { requireApiKey } from './middlewares/auth.middleware.js';
import { auditAuthenticatedRequest } from './middlewares/auth-audit.middleware.js';
import { rateLimit } from './middlewares/rate-limit.middleware.js';
import { securityHeaders } from './middlewares/security-headers.middleware.js';
import { cors } from './middlewares/cors.middleware.js';

export const createApp = () => {
    const app = express();

    app.disable('x-powered-by');
    app.use(securityHeaders);
    app.use(cors);
    app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '32kb' }));

    app.use('/api/tutor/qdrant', rateLimit, requireApiKey, auditAuthenticatedRequest, qdrantAdminRoutes);
    app.use('/api/tutor', rateLimit, requireApiKey, auditAuthenticatedRequest, tutorRoutes);

    app.use((err, req, res, next) => {
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
            return res.status(400).json({ error: 'JSON invalido.' });
        }
        if (err?.name === 'MulterError') {
            return res.status(400).json({ error: 'Fichero invalido o limite de subida excedido.' });
        }
        next(err);
    });

    return app;
};

export default createApp;
