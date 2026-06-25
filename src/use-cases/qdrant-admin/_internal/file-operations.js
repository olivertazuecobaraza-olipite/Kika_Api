import path from 'path';
import { randomUUID } from 'crypto';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { qdrant } from '../../../config/qdrant.js';
import { openai } from '../../../config/openai.js';
import { QdrantCollection } from '../../../models/qdrant-collection.model.js';
import { invalidateCollectionCache } from '../../tutor/invalidateCollectionCache.use-case.js';
import { chunkText } from '../chunkText.use-case.js';
import { collectionExistsInQdrant } from '../collectionExistsInQdrant.use-case.js';
import { normalizeUploadedFileName } from '../normalizeUploadedFileName.use-case.js';
import { createPublicError } from './public-error.js';
import { scrollCollection } from './scroll-collection.js';
import { serializeCollection } from './serialize-collection.js';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

const extractPdfText = async (buffer) => {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return result.text || '';
    } finally {
        await parser.destroy();
    }
};
const extractTextFromFile = async (file) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/pdf' || extension === '.pdf') {
        return extractPdfText(file.buffer);
    }
    if (
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        || extension === '.docx'
    ) {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value || '';
    }
    if (file.mimetype === 'text/plain' || extension === '.txt') {
        return file.buffer.toString('utf8');
    }
    throw createPublicError({
        name: 'UnsupportedUploadTypeError',
        status: 400,
        message: 'Tipo de fichero no soportado. Solo se admiten PDF, DOCX y TXT.'
    });
};

export const ensureCollectionReady = async (collectionName) => {
    const collection = await QdrantCollection.findOne({ collectionName, status: { $ne: 'deleted' } });
    if (!collection || !await collectionExistsInQdrant(collectionName)) {
        throw createPublicError({
            name: 'QdrantCollectionNotFoundError',
            status: 404,
            message: 'La coleccion no existe.'
        });
    }
    return collection;
};

const createFileFilter = ({ fileId, fileName }) => ({
    must: [
        fileId
            ? { key: 'file_id', match: { value: fileId } }
            : { key: 'file_name', match: { value: fileName } }
    ]
});

export const removeExistingFilePoints = async ({ collectionName, fileId, fileName }) => {
    const filter = createFileFilter({ fileId, fileName });
    const points = await scrollCollection(collectionName, { filter });
    const ids = points.map(point => point.id);
    if (ids.length > 0) {
        await qdrant.delete(collectionName, {
            wait: true,
            points: ids
        });
    }
    return ids.length;
};

export const upsertFile = async ({ collection, file, courseId, curso, replaceExisting = false }) => {
    const collectionName = collection.collectionName;
    const fileName = normalizeUploadedFileName(file.originalname);
    const existingFile = collection.files.find(item => item.fileName === fileName && item.status !== 'deleted');
    if (existingFile && !replaceExisting) {
        throw createPublicError({
            name: 'QdrantFileConflictError',
            status: 409,
            message: `El fichero ${fileName} ya existe en la coleccion.`
        });
    }

    if (existingFile && replaceExisting) {
        await removeExistingFilePoints({ collectionName, fileId: existingFile.fileId });
        collection.files = collection.files.filter(item => item.fileId !== existingFile.fileId);
    }

    const fileId = randomUUID();
    const uploadedAt = new Date();
    const text = await extractTextFromFile(file);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
        throw createPublicError({
            name: 'EmptyUploadError',
            status: 400,
            message: `No se pudo extraer texto util de ${fileName}.`
        });
    }

    const embeddingResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: chunks
    });

    const points = chunks.map((chunk, index) => ({
        id: randomUUID(),
        vector: embeddingResponse.data[index].embedding,
        payload: {
            collection_name: collectionName,
            course_id: courseId || collection.courseId || '',
            curso: curso || collection.curso || '',
            file_id: fileId,
            file_name: fileName,
            mime_type: file.mimetype,
            chunk_index: index,
            page: null,
            source_type: path.extname(fileName).replace('.', '').toLowerCase() || 'text',
            uploaded_at: uploadedAt.toISOString(),
            text: chunk
        }
    }));

    await qdrant.upsert(collectionName, {
        wait: true,
        points
    });

    collection.files.push({
        fileId,
        fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        chunks: chunks.length,
        status: 'ready',
        uploadedAt
    });
    if (courseId) collection.courseId = courseId;
    if (curso) collection.curso = curso;
    collection.status = 'ready';
    await collection.save();
    invalidateCollectionCache(collectionName);

    return serializeCollection(collection).files.find(item => item.file_id === fileId);
};
