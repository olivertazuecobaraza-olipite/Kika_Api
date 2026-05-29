import { Schema, model } from 'mongoose';

const ConversationSchema = new Schema({
    userId: { type: String, required: true },
    courseId: { type: String, required: true },
    curso: { type: String, required: true },
    vsIdQdrant: { type: String, required: true },
    title: { type: String, required: true, default: 'Nueva conversación' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastMessageAt: { type: Date, default: Date.now }
});

ConversationSchema.index({ userId: 1, lastMessageAt: -1 });
ConversationSchema.index({ userId: 1, courseId: 1, lastMessageAt: -1 });

export const Conversation = model('Conversation', ConversationSchema, 'kika_conversations');
