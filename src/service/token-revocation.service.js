import { RevokedToken } from '../models/revoked-token.model.js';

export const isTokenRevoked = async (jti) => {
    const revokedToken = await RevokedToken.findOne({ jti }).lean();
    return Boolean(revokedToken);
};

export const revokeToken = async ({ jti, subject, expiresAt, reason = '' }) => RevokedToken.findOneAndUpdate(
    { jti },
    {
        $setOnInsert: {
            jti,
            subject,
            expiresAt,
            revokedAt: new Date(),
            reason
        }
    },
    { upsert: true, new: true }
);
