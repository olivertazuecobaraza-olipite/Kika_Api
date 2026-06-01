import { Schema, model } from 'mongoose';

const SourceSchema = new Schema({
    titulo: { type: String, required: true },
    url: { type: String, required: true },
    fecha: { type: String, default: '' }
}, { _id: false });

const MessageSchema = new Schema({
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    webSearchUsed: { type: Boolean, default: false },
    sources: { type: [SourceSchema], default: [] },
    createdAt: { type: Date, default: Date.now }
});

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = model('Message', MessageSchema, 'kika_messages');
