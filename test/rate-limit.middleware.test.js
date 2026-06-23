import assert from 'node:assert/strict';
import test from 'node:test';

process.env.RATE_LIMIT_MAX = '2';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

const { rateLimit } = await import('../src/middlewares/rate-limit.middleware.js');

const invoke = ip => {
    const req = { ip, socket: {} };
    const res = {
        statusCode: null,
        payload: null,
        headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };
    let nextCalled = false;
    rateLimit(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
};

test('permite hasta el limite configurado por IP', () => {
    assert.equal(invoke('192.0.2.1').nextCalled, true);
    assert.equal(invoke('192.0.2.1').nextCalled, true);
});

test('devuelve 429 y Retry-After al superar el limite', () => {
    invoke('192.0.2.2');
    invoke('192.0.2.2');
    const blocked = invoke('192.0.2.2');

    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.res.statusCode, 429);
    assert.match(blocked.res.headers['Retry-After'], /^\d+$/);
    assert.deepEqual(blocked.res.payload, { error: 'Demasiadas solicitudes.' });
});

test('mantiene contadores independientes por IP', () => {
    invoke('192.0.2.3');
    invoke('192.0.2.3');
    assert.equal(invoke('192.0.2.4').nextCalled, true);
});
