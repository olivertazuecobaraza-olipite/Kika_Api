// src/models/interaction.model.js
import { Schema, model } from 'mongoose';

const InteractionSchema = new Schema({
    courseId: { type: String, required: true },
    curso: { type: String, required: true },
    vsIdQdrant: { type: String, required: true },
    prompt: { type: String, required: true },
    respuesta: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

InteractionSchema.index({ courseId: 1, createdAt: -1 });

export const Interaction = model('Interaction', InteractionSchema, "kika_interactions");