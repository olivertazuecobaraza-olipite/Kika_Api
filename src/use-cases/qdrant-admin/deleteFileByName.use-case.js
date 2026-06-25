import { invalidateCollectionCache } from '../tutor/invalidateCollectionCache.use-case.js';
import { ensureCollectionReady, removeExistingFilePoints } from './_internal/file-operations.js';

export const deleteFileByName = async ({ collectionName, fileName }) => {
    const collection = await ensureCollectionReady(collectionName);
    const deletedPoints = await removeExistingFilePoints({ collectionName, fileName });
    collection.files.forEach(file => {
        if (file.fileName === fileName) file.status = 'deleted';
    });
    await collection.save();
    invalidateCollectionCache(collectionName);

    return {
        deleted: true,
        collection_name: collectionName,
        file_name: fileName,
        deleted_points: deletedPoints
    };
};
