import { IssuedToken } from '../models/issued-token.model.js';
import { revokeToken } from './token-revocation.service.js';

export const findActiveLicense = async (jti) => IssuedToken.findOne({
    jti,
    status: 'active'
}).lean();

export const registerIssuedLicense = async ({
    jti,
    subject,
    clientName,
    clientEmail,
    keyId,
    issuedAt,
    expiresAt
}) => IssuedToken.create({
    jti,
    subject,
    clientName,
    clientEmail,
    keyId,
    issuedAt,
    expiresAt,
    status: 'active'
});

export const supersedeLicense = async ({ previousJti, replacementJti, reason = 'Renovacion de licencia' }) => {
    const previousLicense = await IssuedToken.findOneAndUpdate(
        { jti: previousJti, status: 'active' },
        {
            $set: {
                status: 'superseded',
                replacedByJti: replacementJti,
                revokedAt: new Date(),
                reason
            }
        },
        { new: true }
    );

    if (!previousLicense) {
        throw new Error('La licencia anterior no existe o ya no esta activa.');
    }

    await revokeToken({
        jti: previousLicense.jti,
        subject: previousLicense.subject,
        expiresAt: previousLicense.expiresAt,
        reason
    });

    return previousLicense;
};

export const revokeIssuedLicense = async ({ jti, reason = 'Revocacion manual' }) => {
    const license = await IssuedToken.findOneAndUpdate(
        { jti, status: 'active' },
        {
            $set: {
                status: 'revoked',
                revokedAt: new Date(),
                reason
            }
        },
        { new: true }
    );

    if (!license) {
        throw new Error('La licencia no existe o ya no esta activa.');
    }

    await revokeToken({
        jti: license.jti,
        subject: license.subject,
        expiresAt: license.expiresAt,
        reason
    });

    return license;
};
