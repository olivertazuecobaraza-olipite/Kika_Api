import { Schema, model } from 'mongoose';

const IssuedTokenSchema = new Schema({
    jti: { type: String, required: true },
    subject: { type: String, required: true },
    clientName: { type: String, required: true },
    clientEmail: { type: String, required: true },
    keyId: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    status: {
        type: String,
        enum: ['active', 'superseded', 'revoked'],
        required: true,
        default: 'active'
    },
    replacedByJti: { type: String, default: '' },
    revokedAt: { type: Date },
    reason: { type: String, default: '' }
});

IssuedTokenSchema.index({ jti: 1 }, { unique: true });
IssuedTokenSchema.index({ subject: 1, status: 1 });
IssuedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IssuedToken = model('IssuedToken', IssuedTokenSchema, 'kika_issued_tokens');
