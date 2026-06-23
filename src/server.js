import 'dotenv/config';
import { validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;

try {
    validateEnv();
    await connectDB();
    createApp().listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
} catch (error) {
    console.error('Error al inicializar la aplicacion:', error);
    process.exit(1);
}
