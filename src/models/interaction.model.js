// src/models/interaction.model.js
import { Schema, model } from 'mongoose';

const SourceSchema = new Schema({
    titulo: { type: String, required: true },
    url: { type: String, required: true },
    fecha: { type: String, default: '' }
}, { _id: false });

const InteractionSchema = new Schema({
    courseId: { type: String, required: true },
    curso: { type: String, required: true },
    vsIdQdrant: { type: String, required: true },
    prompt: { type: String, required: true },
    respuesta: { type: String, required: true },
    webSearchUsed: { type: Boolean, default: false },
    sources: { type: [SourceSchema], default: [] },
    createdAt: { type: Date, default: Date.now }
});

InteractionSchema.index({ courseId: 1, createdAt: -1 });

export const Interaction = model('Interaction', InteractionSchema, "kika_interactions");
