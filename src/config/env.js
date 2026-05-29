const requiredEnvVars = [
    'MONGO_URI',
    'OPENAI_API_KEY',
    'QDRANT_URL'
];

export const validateEnv = () => {
    const missingVars = requiredEnvVars.filter(name => !process.env[name]);

    if (missingVars.length > 0) {
        throw new Error(`Faltan variables de entorno requeridas: ${missingVars.join(', ')}`);
    }

    if (process.env.NODE_ENV === 'production' && !process.env.API_KEY) {
        throw new Error('API_KEY es requerida en produccion.');
    }
};
