import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { auditAuthenticatedRequest } from '../src/middlewares/auth-audit.middleware.js';

const originalIncludeIp = process.env.AUTH_AUDIT_INCLUDE_IP;
const originalInfo = console.info;

test.afterEach(() => {
    console.info = originalInfo;
    if (originalIncludeIp === undefined) {
        delete process.env.AUTH_AUDIT_INCLUDE_IP;
    } else {
        process.env.AUTH_AUDIT_INCLUDE_IP = originalIncludeIp;
    }
});

const captureAudit = ({ includeIp = false } = {}) => {
    process.env.AUTH_AUDIT_INCLUDE_IP = String(includeIp);
    const events = [];
    console.info = value => events.push(JSON.parse(value));

    const req = {
        auth: {
            type: 'jwt',
            subject: 'cliente_demo',
            tokenId: 'token-id'
        },
        method: 'GET',
        originalUrl: '/api/tutor/conversations',
        ip: '127.0.0.1',
        headers: { authorization: 'Bearer token-secreto' }
    };
    const res = new EventEmitter();
    res.statusCode = 200;
    auditAuthenticatedRequest(req, res, () => {});
    res.emit('finish');
    return events[0];
};

test('audita identidad sin registrar token ni IP por defecto', () => {
    const event = captureAudit();
    assert.equal(event.subject, 'cliente_demo');
    assert.equal(event.jti, 'token-id');
    assert.equal(event.ip, undefined);
    assert.doesNotMatch(JSON.stringify(event), /token-secreto/);
});

test('incluye IP solo cuando se habilita explicitamente', () => {
    assert.equal(captureAudit({ includeIp: true }).ip, '127.0.0.1');
});
