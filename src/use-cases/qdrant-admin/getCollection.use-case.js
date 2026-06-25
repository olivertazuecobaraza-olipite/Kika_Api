import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { createPublicError } from './_internal/public-error.js';
import { serializeCollection } from './_internal/serialize-collection.js';

export const getCollection = async (collectionName) => {
    const collection = await QdrantCollection.findOne({ collectionName, status: { $ne: 'deleted' } });
    if (!collection) {
        throw createPublicError({
            name: 'QdrantCollectionNotFoundError',
            status: 404,
            message: 'La coleccion no existe en el registro local.'
        });
    }
    return serializeCollection(collection);
};
