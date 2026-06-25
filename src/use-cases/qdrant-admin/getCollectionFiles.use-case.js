import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { collectionExistsInQdrant } from './collectionExistsInQdrant.use-case.js';
import { groupFilesFromPoints } from './groupFilesFromPoints.use-case.js';
import { createPublicError } from './_internal/public-error.js';
import { scrollCollection } from './_internal/scroll-collection.js';
import { serializeCollection } from './_internal/serialize-collection.js';

export const getCollectionFiles = async (collectionName) => {
    const collection = await QdrantCollection.findOne({ collectionName, status: { $ne: 'deleted' } });
    const files = collection?.files?.filter(file => file.status !== 'deleted') || [];
    if (files.length > 0) {
        return {
            collection_name: collectionName,
            files: serializeCollection(collection).files
        };
    }

    if (!await collectionExistsInQdrant(collectionName)) {
        throw createPublicError({
            name: 'QdrantCollectionNotFoundError',
            status: 404,
            message: 'La coleccion no existe en Qdrant.'
        });
    }

    const points = await scrollCollection(collectionName);
    return {
        collection_name: collectionName,
        files: groupFilesFromPoints(points)
    };
};
