export const auditAuthenticatedRequest = (req, res, next) => {
    res.on('finish', () => {
        if (!req.auth) return;

        const auditEvent = {
            event: 'api_request',
            auth_type: req.auth.type,
            subject: req.auth.subject || null,
            jti: req.auth.tokenId || null,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            timestamp: new Date().toISOString()
        };
        if (process.env.AUTH_AUDIT_INCLUDE_IP === 'true') {
            auditEvent.ip = req.ip;
        }

        console.info(JSON.stringify(auditEvent));
    });
    next();
};
