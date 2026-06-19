import path from 'path';
import { randomUUID } from 'crypto';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { qdrant } from '../../config/qdrant.js';
import { openai } from '../../config/openai.js';
import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { invalidateCollectionCache } from '../tutor/invalidateCollectionCache.use-case.js';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);
const DEFAULT_PAGE_SIZE = Number(process.env.QDRANT_ADMIN_PAGE_SIZE || 10);
const MAX_PAGE_SIZE = Number(process.env.QDRANT_ADMIN_MAX_PAGE_SIZE || 50);
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);
const CHUNK_SIZE = Number(process.env.QDRANT_CHUNK_SIZE || 1200);
const CHUNK_OVERLAP = Number(process.env.QDRANT_CHUNK_OVERLAP || 150);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeCollectionName = (value) => String(value || '').trim();

export const normalizeUploadedFileName = (fileName) => {
    const baseName = path.basename(String(fileName || 'documento.txt'));
    return baseName.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || `fichero-${Date.now()}`;
};

const createPublicError = ({ name, status, message, cause }) => {
    const error = new Error(message);
    error.name = name;
    error.status = status;
    error.publicMessage = message;
    error.cause = cause;
    return error;
};

const createCollectionConflictError = ({ collectionName, source }) => createPublicError({
    name: 'QdrantCollectionConflictError',
    status: 409,
    message: `La coleccion "${collectionName}" ya existe en ${source}. Usa otro collection_name o borra la coleccion existente antes de crearla de nuevo.`
});

const getQdrantCollections = async () => {
    const response = await qdrant.getCollections();
    return response.collections || [];
};

export const listQdrantCollectionsFromServer = async () => getQdrantCollections();

export const collectionExistsInQdrant = async (collectionName) => {
    const collections = await getQdrantCollections();
    return collections.some(collection => collection.name === collectionName);
};

const normalizePagination = ({ page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPageSize = Math.min(
        Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE),
        MAX_PAGE_SIZE
    );
    return { page: normalizedPage, pageSize: normalizedPageSize };
};

const serializeCollection = (collection) => ({
    collection_name: collection.collectionName,
    display_name: collection.displayName,
    course_id: collection.courseId,
    curso: collection.curso,
    status: collection.status,
    vector_size: collection.vectorSize,
    distance: collection.distance,
    files_count: collection.files?.filter(file => file.status !== 'deleted').length || 0,
    files: (collection.files || [])
        .filter(file => file.status !== 'deleted')
        .map(file => ({
            file_id: file.fileId,
            file_name: file.fileName,
            original_name: file.originalName,
            mime_type: file.mimeType,
            size: file.size,
            chunks: file.chunks,
            status: file.status,
            uploaded_at: file.uploadedAt,
            error: file.error
        })),
    created_at: collection.createdAt,
    updated_at: collection.updatedAt
});

const buildCollectionQuery = ({ courseId, curso, fileName, search } = {}) => {
    const query = { status: { $ne: 'deleted' } };
    if (courseId) query.courseId = courseId;
    if (curso) query.curso = curso;
    if (fileName) query['files.fileName'] = { $regex: escapeRegex(fileName), $options: 'i' };
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        query.$or = [
            { collectionName: regex },
            { displayName: regex },
            { courseId: regex },
            { curso: regex },
            { 'files.fileName': regex }
        ];
    }
    return query;
};

export const listManagedCollections = async (filters = {}) => {
    const { page, pageSize } = normalizePagination(filters);
    const query = buildCollectionQuery(filters);
    const [items, total] = await Promise.all([
        QdrantCollection.find(query)
            .sort({ updatedAt: -1, collectionName: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        QdrantCollection.countDocuments(query)
    ]);

    return {
        items: items.map(serializeCollection),
        page,
        page_size: pageSize,
        total,
        has_next: page * pageSize < total
    };
};

const scrollCollection = async (collectionName, { filter, limit = 100, maxPoints = MAX_SCROLL_POINTS } = {}) => {
    let offset = undefined;
    const points = [];
    do {
        const response = await qdrant.scroll(collectionName, {
            limit,
            with_payload: true,
            with_vector: false,
            filter,
            offset
        });
        points.push(...(response.points || []));
        offset = response.next_page_offset;
        if (points.length >= maxPoints) break;
    } while (offset);

    return points;
};

export const groupFilesFromPoints = (points = []) => {
    const filesByName = new Map();
    points.forEach(point => {
        const payload = point.payload || {};
        const fileName = payload.file_name || 'sin_nombre';
        const existing = filesByName.get(fileName) || {
            file_id: payload.file_id || '',
            file_name: fileName,
            original_name: payload.file_name || fileName,
            mime_type: payload.mime_type || '',
            size: 0,
            chunks: 0,
            status: 'ready',
            uploaded_at: payload.uploaded_at || null,
            error: ''
        };
        existing.chunks += 1;
        if (!existing.file_id && payload.file_id) existing.file_id = payload.file_id;
        if (!existing.uploaded_at && payload.uploaded_at) existing.uploaded_at = payload.uploaded_at;
        filesByName.set(fileName, existing);
    });

    return [...filesByName.values()].sort((a, b) => a.file_name.localeCompare(b.file_name));
};

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

export const syncCollections = async () => {
    const qdrantCollections = await getQdrantCollections();
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

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export const chunkText = (text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) => {
    const normalized = normalizeText(text);
    if (!normalized) return [];

    const chunks = [];
    let start = 0;
    while (start < normalized.length) {
        const end = Math.min(start + chunkSize, normalized.length);
        chunks.push(normalized.slice(start, end).trim());
        if (end === normalized.length) break;
        start = Math.max(end - overlap, start + 1);
    }
    return chunks.filter(Boolean);
};

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

const ensureCollectionReady = async (collectionName) => {
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

const removeExistingFilePoints = async ({ collectionName, fileId, fileName }) => {
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

const upsertFile = async ({ collection, file, courseId, curso, replaceExisting = false }) => {
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
