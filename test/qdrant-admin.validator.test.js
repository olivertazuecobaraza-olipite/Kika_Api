import assert from 'node:assert/strict';
import test from 'node:test';

const {
    validateCreateQdrantCollection,
    validateDeleteQdrantCollection,
    validateDeleteQdrantFileByName,
    validateListQdrantCollections,
    validateQdrantFileId,
    validateQdrantUploadFields
} = await import('../src/middlewares/qdrant-admin.middleware.js');

const runValidators = async (validators, values = {}) => {
    const req = {
        body: values.body || {},
        params: values.params || {},
        query: values.query || {}
    };
    const res = {
        statusCode: null,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; }
    };

    for (const middleware of validators) {
        if (res.statusCode) break;
        await new Promise((resolve, reject) => {
            let settled = false;
            const done = error => {
                if (settled) return;
                settled = true;
                error ? reject(error) : resolve();
            };
            try {
                const result = middleware(req, res, done);
                Promise.resolve(result).then(() => {
                    if (res.statusCode) done();
                }, done);
            } catch (error) {
                done(error);
            }
        });
    }
    return { req, res };
};

const fields = result => (result.res.payload?.errors || []).map(error => error.field);

test('acepta filtros y paginacion administrativa validos', async () => {
    const result = await runValidators(validateListQdrantCollections, {
        query: { page: '2', page_size: '25', course_id: '790', search: 'manual.pdf' }
    });
    assert.equal(result.res.statusCode, null);
});

test('rechaza paginacion fuera de rango', async () => {
    const result = await runValidators(validateListQdrantCollections, {
        query: { page: '0', page_size: '999' }
    });
    assert.deepEqual(fields(result).sort(), ['page', 'page_size']);
});

test('rechaza nombres de coleccion que permitan rutas', async () => {
    const result = await runValidators(validateCreateQdrantCollection, {
        body: { collection_name: '../privada' }
    });
    assert.ok(fields(result).includes('collection_name'));
});

test('valida replace_existing como booleano', async () => {
    const result = await runValidators(validateQdrantUploadFields, {
        body: { replace_existing: 'no' }
    });
    assert.ok(fields(result).includes('replace_existing'));
});

test('exige identificadores de fichero y nombres no vacios', async () => {
    const byId = await runValidators(validateQdrantFileId, {
        params: { collectionName: 'collection_test', fileId: '' }
    });
    const byName = await runValidators(validateDeleteQdrantFileByName, {
        params: { collectionName: 'collection_test' }, query: { file_name: '' }
    });
    assert.ok(fields(byId).includes('fileId'));
    assert.ok(fields(byName).includes('file_name'));
});

test('exige confirm=true para borrar una coleccion', async () => {
    const result = await runValidators(validateDeleteQdrantCollection, {
        params: { collectionName: 'collection_test' }, query: { confirm: 'false' }
    });
    assert.ok(fields(result).includes('confirm'));
});
