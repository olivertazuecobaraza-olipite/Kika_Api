import { normalizeUploadedFileName } from './normalizeUploadedFileName.use-case.js';
import { createPublicError } from './_internal/public-error.js';
import { ensureCollectionReady, upsertFile } from './_internal/file-operations.js';

export const uploadMultipleFiles = async ({ collectionName, files = [], courseId, curso, replaceExisting = false }) => {
    if (!Array.isArray(files) || files.length === 0) {
        throw createPublicError({
            name: 'MissingUploadError',
            status: 400,
            message: 'Debes enviar al menos un fichero.'
        });
    }

    const uploaded = [];
    const failed = [];
    for (const file of files) {
        try {
            const collection = await ensureCollectionReady(collectionName);
            uploaded.push(await upsertFile({ collection, file, courseId, curso, replaceExisting }));
        } catch (error) {
            failed.push({
                file_name: normalizeUploadedFileName(file.originalname),
                error: error.publicMessage || error.message
            });
        }
    }

    return { collection_name: collectionName, uploaded, failed };
};
