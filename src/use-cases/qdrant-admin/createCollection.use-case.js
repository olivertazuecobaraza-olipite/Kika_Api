import { qdrant } from '../../config/qdrant.js';
import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { collectionExistsInQdrant } from './collectionExistsInQdrant.use-case.js';
import { normalizeCollectionName } from './normalizeCollectionName.use-case.js';
import { createPublicError } from './_internal/public-error.js';
import { serializeCollection } from './_internal/serialize-collection.js';

const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);

const createCollectionConflictError = ({ collectionName, source }) => createPublicError({
    name: 'QdrantCollectionConflictError',
    status: 409,
    message: `La coleccion "${collectionName}" ya existe en ${source}. Usa otro collection_name o borra la coleccion existente antes de crearla de nuevo.`
});


export const createCollection = async ({ collectionName, displayName = '', courseId = '', curso = '' }) => {
    const normalizedName = normalizeCollectionName(collectionName);
    const existingMetadata = await QdrantCollection.findOne({ collectionName: normalizedName });
    const existsInQdrant = await collectionExistsInQdrant(normalizedName);
    if (existsInQdrant) {
        throw createCollectionConflictError({
            collectionName: normalizedName,
            source: 'Qdrant'
        });
    }

    if (existingMetadata && !['deleted', 'error'].includes(existingMetadata.status)) {
        throw createCollectionConflictError({
            collectionName: normalizedName,
            source: 'el registro local'
        });
    }

    if (existingMetadata) {
        existingMetadata.set({
            displayName: displayName || normalizedName,
            courseId,
            curso,
            status: 'creating',
            vectorSize: VECTOR_SIZE,
            distance: 'Cosine',
            files: [],
            error: ''
        });
        await existingMetadata.save();
    } else {
        await QdrantCollection.create({
            collectionName: normalizedName,
            displayName: displayName || normalizedName,
            courseId,
            curso,
            status: 'creating',
            vectorSize: VECTOR_SIZE,
            distance: 'Cosine'
        });
    }

    try {
        await qdrant.createCollection(normalizedName, {
            vectors: {
                size: VECTOR_SIZE,
                distance: 'Cosine'
            }
        });

        const updated = await QdrantCollection.findOneAndUpdate(
            { collectionName: normalizedName },
            { status: 'ready', error: '' },
            { new: true }
        );
        return serializeCollection(updated);
    } catch (error) {
        await QdrantCollection.findOneAndUpdate(
            { collectionName: normalizedName },
            { status: 'error', error: error.message }
        );
        throw error;
    }
};
