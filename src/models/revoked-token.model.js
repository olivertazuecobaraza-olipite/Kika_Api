import { Schema, model } from 'mongoose';

const RevokedTokenSchema = new Schema({
    jti: { type: String, required: true },
    subject: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' }
});

RevokedTokenSchema.index({ jti: 1 }, { unique: true });
RevokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken = model('RevokedToken', RevokedTokenSchema, 'kika_revoked_tokens');
