import assert from 'node:assert/strict';
import test from 'node:test';

const {
    validateExamGeneration,
    validateExerciseGeneration,
    validateSummaryGeneration
} = await import('../src/middlewares/validator.middleware.js');

const runValidators = async (validators, body) => {
    const req = {
        headers: { 'x-user-id': 'user_1' },
        params: { conversationId: '66583f4c2a0d4b98e1e0a111' },
        body
    };
    let resolveResponse;
    const res = {
        statusCode: null,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            if (resolveResponse) resolveResponse();
            return this;
        }
    };

    for (const middleware of validators) {
        if (res.statusCode) break;
        await new Promise((resolve, reject) => {
            resolveResponse = resolve;
            try {
                middleware(req, res, (err) => err ? reject(err) : resolve());
            } catch (err) {
                reject(err);
            }
        }).finally(() => {
            resolveResponse = null;
        });
    }

    return { req, res };
};

const fields = (payload) => (payload?.errors || []).map(error => error.field);

test('acepta resumen con web_search opcional', async () => {
    const { req, res } = await runValidators(validateSummaryGeneration, {
        tema: 'Prevencion',
        extension: 'breve',
        formato: 'parrafos',
        enfoque: 'conceptos_principales',
        indicaciones_adicionales: 'Usa lenguaje claro',
        web_search: true
    });

    assert.equal(res.statusCode, null);
    assert.equal(req.body.web_search, true);
});

test('rechaza enum invalido en resumen', async () => {
    const { res } = await runValidators(validateSummaryGeneration, {
        tema: 'Prevencion',
        extension: 'larga',
        formato: 'parrafos',
        enfoque: 'conceptos_principales'
    });

    assert.equal(res.statusCode, 400);
    assert.ok(fields(res.payload).includes('extension'));
});

test('rechaza examen mixto sin ambos contadores positivos', async () => {
    const { res } = await runValidators(validateExamGeneration, {
        tema: 'Caja',
        tipo: 'mixto',
        numero_preguntas_test: 4,
        numero_preguntas_abiertas: 0,
        nivel_dificultad: 'intermedio'
    });

    assert.equal(res.statusCode, 400);
    assert.match(JSON.stringify(res.payload), /ambos contadores/);
});

test('rechaza web_search en examen', async () => {
    const { res } = await runValidators(validateExamGeneration, {
        tema: 'Caja',
        tipo: 'test',
        numero_preguntas_test: 4,
        nivel_dificultad: 'basico',
        web_search: true
    });

    assert.equal(res.statusCode, 400);
    assert.ok(fields(res.payload).includes('web_search'));
});

test('rechaza numero negativo de preguntas', async () => {
    const { res } = await runValidators(validateExamGeneration, {
        tema: 'Caja',
        tipo: 'test',
        numero_preguntas_test: -1,
        nivel_dificultad: 'basico'
    });

    assert.equal(res.statusCode, 400);
    assert.ok(fields(res.payload).includes('numero_preguntas_test'));
});

test('acepta ejercicio valido y convierte incluir_solucion a booleano', async () => {
    const { req, res } = await runValidators(validateExerciseGeneration, {
        tema: 'Atencion',
        tipo: 'practica_guiada',
        nivel_dificultad: 'avanzado',
        apartados: 3,
        incluir_solucion: 'true'
    });

    assert.equal(res.statusCode, null);
    assert.equal(req.body.apartados, 3);
    assert.equal(req.body.incluir_solucion, true);
});

test('rechaza web_search en ejercicio', async () => {
    const { res } = await runValidators(validateExerciseGeneration, {
        tema: 'Atencion',
        tipo: 'practica_guiada',
        nivel_dificultad: 'avanzado',
        apartados: 3,
        incluir_solucion: false,
        web_search: true
    });

    assert.equal(res.statusCode, 400);
    assert.ok(fields(res.payload).includes('web_search'));
});
