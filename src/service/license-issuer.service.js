import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
    registerIssuedLicense,
    revokeIssuedLicense,
    supersedeLicense
} from './license-registry.service.js';

export const MAX_LICENSE_MONTHS = 12;

export const parseLicenseMonths = (value) => {
    const months = Number(value);
    if (!Number.isInteger(months) || months < 1 || months > MAX_LICENSE_MONTHS) {
        throw new Error(`months debe ser un entero entre 1 y ${MAX_LICENSE_MONTHS}.`);
    }
    return months;
};

export const addCalendarMonths = (date, months) => {
    const expiresAt = new Date(date);
    const originalDay = expiresAt.getUTCDate();
    expiresAt.setUTCDate(1);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(
        expiresAt.getUTCFullYear(),
        expiresAt.getUTCMonth() + 1,
        0
    )).getUTCDate();
    expiresAt.setUTCDate(Math.min(originalDay, lastDay));
    return expiresAt;
};

export const generateLicenseToken = ({
    privateKey,
    kid,
    clientId,
    clientName,
    clientEmail,
    months,
    issuer = process.env.JWT_ISSUER || 'kika-token-service',
    audience = process.env.JWT_AUDIENCE || 'kika-api',
    now = new Date(),
    tokenId = randomUUID()
}) => {
    if (!privateKey || !kid || !clientId || !clientName || !clientEmail || !issuer || !audience) {
        throw new Error('privateKey, kid, clientId, clientName, clientEmail, issuer y audience son obligatorios.');
    }

    const parsedMonths = parseLicenseMonths(months);
    const issuedAt = new Date(now);
    const expiresAt = addCalendarMonths(issuedAt, parsedMonths);
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
    const token = jwt.sign(
        { sub: clientId, jti: tokenId, iat: issuedAtSeconds, exp: expiresAtSeconds },
        privateKey,
        {
            algorithm: 'RS256',
            keyid: kid,
            issuer,
            audience
        }
    );

    return {
        token,
        jti: tokenId,
        subject: clientId,
        clientName,
        clientEmail,
        keyId: kid,
        issuedAt,
        expiresAt
    };
};

export const issueAndRegisterLicense = async ({
    replaceJti,
    registry = { registerIssuedLicense, revokeIssuedLicense, supersedeLicense },
    ...options
}) => {
    const license = generateLicenseToken(options);
    await registry.registerIssuedLicense(license);
    if (replaceJti) {
        try {
            await registry.supersedeLicense({
                previousJti: replaceJti,
                replacementJti: license.jti
            });
        } catch (error) {
            await registry.revokeIssuedLicense?.({
                jti: license.jti,
                reason: 'Emision revertida por error al sustituir licencia'
            });
            throw error;
        }
    }
    return license;
};
