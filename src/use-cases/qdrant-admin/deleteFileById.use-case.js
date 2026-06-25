import { invalidateCollectionCache } from '../tutor/invalidateCollectionCache.use-case.js';
import { createPublicError } from './_internal/public-error.js';
import { ensureCollectionReady, removeExistingFilePoints } from './_internal/file-operations.js';

export const deleteFileById = async ({ collectionName, fileId }) => {
    const collection = await ensureCollectionReady(collectionName);
    const file = collection.files.find(item => item.fileId === fileId && item.status !== 'deleted');
    if (!file) {
        throw createPublicError({
            name: 'QdrantFileNotFoundError',
            status: 404,
            message: 'El fichero no existe en la coleccion.'
        });
    }

    const deletedPoints = await removeExistingFilePoints({ collectionName, fileId });
    file.status = 'deleted';
    file.error = '';
    await collection.save();
    invalidateCollectionCache(collectionName);

    return {
        deleted: true,
        collection_name: collectionName,
        file_id: fileId,
        file_name: file.fileName,
        deleted_points: deletedPoints
    };
};
