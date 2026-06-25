const collectionCache = new Map();
const CACHE_MAX_COLLECTIONS = Number(process.env.CACHE_MAX_COLLECTIONS || 20);

export const getCollectionCache = (key) => collectionCache.get(key);
export const setCollectionCache = (key, value) => {
    collectionCache.set(key, value);
    while (collectionCache.size > CACHE_MAX_COLLECTIONS) {
        collectionCache.delete(collectionCache.keys().next().value);
    }
};
export const deleteCollectionCache = (key) => collectionCache.delete(key);
