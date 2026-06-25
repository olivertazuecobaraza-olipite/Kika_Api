// src/config/db.js
import mongoose from 'mongoose';

const optionalNumber = (value) => {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const buildMongoOptions = () => Object.fromEntries(Object.entries({
    maxPoolSize: optionalNumber(process.env.MONGO_MAX_POOL_SIZE),
    serverSelectionTimeoutMS: optionalNumber(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS),
    socketTimeoutMS: optionalNumber(process.env.MONGO_SOCKET_TIMEOUT_MS)
}).filter(([, value]) => value !== undefined));

export const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI, buildMongoOptions());
    console.log('Conectado exitosamente a MongoDB');
};
