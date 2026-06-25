import { createPublicError } from './_internal/public-error.js';
import { ensureCollectionReady, upsertFile } from './_internal/file-operations.js';

export const uploadSingleFile = async ({ collectionName, file, courseId, curso, replaceExisting = false }) => {
    if (!file) {
        throw createPublicError({
            name: 'MissingUploadError',
            status: 400,
            message: 'Debes enviar un fichero.'
        });
    }
    const collection = await ensureCollectionReady(collectionName);
    const uploaded = await upsertFile({ collection, file, courseId, curso, replaceExisting });
    return { collection_name: collectionName, uploaded };
};
