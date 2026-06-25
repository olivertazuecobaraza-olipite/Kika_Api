const collectionCache = new Map();
const collectionLoads = new Map();
const CACHE_MAX_COLLECTIONS = Number(process.env.CACHE_MAX_COLLECTIONS || 20);

export const getCollectionCache = (key) => collectionCache.get(key);
export const setCollectionCache = (key, value) => {
    collectionCache.set(key, value);
    while (collectionCache.size > CACHE_MAX_COLLECTIONS) {
        collectionCache.delete(collectionCache.keys().next().value);
    }
};
export const getCollectionLoad = (key) => collectionLoads.get(key);
export const setCollectionLoad = (key, value) => collectionLoads.set(key, value);
export const deleteCollectionLoad = (key) => collectionLoads.delete(key);
export const deleteCollectionCache = (key) => {
    collectionLoads.delete(key);
    return collectionCache.delete(key);
};
