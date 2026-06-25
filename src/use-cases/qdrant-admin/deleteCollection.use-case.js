import { qdrant } from '../../config/qdrant.js';
import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { invalidateCollectionCache } from '../tutor/invalidateCollectionCache.use-case.js';
import { collectionExistsInQdrant } from './collectionExistsInQdrant.use-case.js';
import { createPublicError } from './_internal/public-error.js';

export const deleteCollection = async ({ collectionName, confirm = false }) => {
    if (!confirm) {
        throw createPublicError({
            name: 'DeleteConfirmationRequiredError',
            status: 400,
            message: 'Para eliminar una coleccion debes enviar confirm=true.'
        });
    }

    const collection = await QdrantCollection.findOne({ collectionName, status: { $ne: 'deleted' } });
    if (collection) {
        collection.status = 'deleting';
        await collection.save();
    }

    if (!await collectionExistsInQdrant(collectionName)) {
        throw createPublicError({
            name: 'QdrantCollectionNotFoundError',
            status: 404,
            message: 'La coleccion no existe en Qdrant.'
        });
    }

    await qdrant.deleteCollection(collectionName);
    await QdrantCollection.findOneAndUpdate(
        { collectionName },
        { status: 'deleted', files: [], error: '' },
        { upsert: false }
    );
    invalidateCollectionCache(collectionName);

    return {
        deleted: true,
        collection_name: collectionName
    };
};
