// src/app.js
import 'dotenv/config';
import express from 'express';
import { validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import tutorRoutes from './routes/tutor.routes.js';
import { requireApiKey } from './middlewares/auth.middleware.js';
import { rateLimit } from './middlewares/rate-limit.middleware.js';
import { securityHeaders } from './middlewares/security-headers.middleware.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Globales
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '32kb' }));

// Montar Rutas de la API
app.use('/api/tutor', rateLimit, requireApiKey, tutorRoutes);

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'JSON invalido.' });
    }
    next(err);
});

// Conectar a la Base de Datos antes de levantar el servidor
try {
    validateEnv();
    await connectDB();
    // Iniciar Servidor
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
} catch (error) {
    console.error('Error al inicializar la aplicación:', error);
    process.exit(1);
}
