import { deleteCollectionCache } from './_internal/collection-cache.js';

export const invalidateCollectionCache = (vsIdQdrant) => {
    deleteCollectionCache(vsIdQdrant);
};
