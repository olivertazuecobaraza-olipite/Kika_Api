import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deleteCollectionCache,
    getCollectionCache,
    setCollectionCache
} from '../src/use-cases/tutor/_internal/collection-cache.js';
import { invalidateCollectionCache } from '../src/use-cases/tutor/invalidateCollectionCache.use-case.js';

test('invalidateCollectionCache elimina el estado singleton compartido', () => {
    const collectionName = `test-${Date.now()}`;
    const value = { timestamp: Date.now(), data: { files: [] } };

    setCollectionCache(collectionName, value);
    assert.equal(getCollectionCache(collectionName), value);

    invalidateCollectionCache(collectionName);
    assert.equal(getCollectionCache(collectionName), undefined);
    deleteCollectionCache(collectionName);
});
