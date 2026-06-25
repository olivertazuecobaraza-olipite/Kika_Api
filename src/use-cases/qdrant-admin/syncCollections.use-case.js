import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { groupFilesFromPoints } from './groupFilesFromPoints.use-case.js';
import { listQdrantCollectionsFromServer } from './listQdrantCollectionsFromServer.use-case.js';
import { scrollCollection } from './_internal/scroll-collection.js';
import { serializeCollection } from './_internal/serialize-collection.js';

const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);

export const syncCollections = async () => {
    const qdrantCollections = await listQdrantCollectionsFromServer();
    const synced = [];

    for (const collection of qdrantCollections) {
        const collectionName = collection.name;
        let metadata = await QdrantCollection.findOne({ collectionName });
        const points = !metadata || metadata.status === 'untracked' || metadata.files.length === 0
            ? await scrollCollection(collectionName)
            : null;
        const groupedFiles = points
            ? groupFilesFromPoints(points).map(file => ({
                fileId: file.file_id || `legacy:${file.file_name}`,
                fileName: file.file_name,
                originalName: file.original_name,
                mimeType: file.mime_type || 'application/octet-stream',
                size: file.size || 0,
                chunks: file.chunks,
                status: 'ready',
                uploadedAt: file.uploaded_at ? new Date(file.uploaded_at) : new Date()
            }))
            : null;

        if (!metadata) {
            metadata = await QdrantCollection.create({
                collectionName,
                displayName: collectionName,
                status: 'untracked',
                vectorSize: VECTOR_SIZE,
                distance: 'Cosine',
                files: groupedFiles
            });
        } else if (groupedFiles) {
            metadata.files = groupedFiles;
            if (metadata.status === 'deleted') metadata.status = 'untracked';
            await metadata.save();
        }
        synced.push(serializeCollection(metadata));
    }

    return { synced, total: synced.length };
};
