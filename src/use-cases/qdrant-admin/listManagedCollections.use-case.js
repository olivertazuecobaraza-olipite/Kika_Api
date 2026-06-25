import { QdrantCollection } from '../../models/qdrant-collection.model.js';
import { serializeCollection } from './_internal/serialize-collection.js';

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE || 1536);
const DEFAULT_PAGE_SIZE = Number(process.env.QDRANT_ADMIN_PAGE_SIZE || 10);
const MAX_PAGE_SIZE = Number(process.env.QDRANT_ADMIN_MAX_PAGE_SIZE || 50);
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePagination = ({ page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPageSize = Math.min(
        Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE),
        MAX_PAGE_SIZE
    );
    return { page: normalizedPage, pageSize: normalizedPageSize };
};

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
