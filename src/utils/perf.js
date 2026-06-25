import { performance } from 'node:perf_hooks';

const PERF_DEBUG = /^true$/i.test(process.env.PERF_DEBUG || '');

export const isPerfDebugEnabled = () => /^true$/i.test(process.env.PERF_DEBUG || '');

export const nowMs = () => performance.now();

export const markDuration = (start) => Math.round((nowMs() - start) * 100) / 100;

export const logPerf = (event, data = {}) => {
    if (!isPerfDebugEnabled()) return;
    console.info(JSON.stringify({
        event,
        ...data
    }));
};

export const createPerfTimer = (event, base = {}) => {
    const start = nowMs();
    const marks = {};

    return {
        async track(name, action) {
            const markStart = nowMs();
            try {
                return await action();
            } finally {
                marks[name] = markDuration(markStart);
            }
        },
        mark(name, markStart) {
            marks[name] = markDuration(markStart);
        },
        flush(extra = {}) {
            if (!PERF_DEBUG && !isPerfDebugEnabled()) return;
            logPerf(event, {
                ...base,
                ...extra,
                timings_ms: {
                    ...marks,
                    total: markDuration(start)
                }
            });
        }
    };
};

