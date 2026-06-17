import { Schema, model } from 'mongoose';

const QdrantFileSchema = new Schema({
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    chunks: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['indexing', 'ready', 'error', 'deleted'],
        default: 'indexing'
    },
    uploadedAt: { type: Date, default: Date.now },
    error: { type: String, default: '' }
}, { _id: false });

const QdrantCollectionSchema = new Schema({
    collectionName: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: '' },
    courseId: { type: String, default: '', index: true },
    curso: { type: String, default: '', index: true },
    status: {
        type: String,
        enum: ['creating', 'ready', 'indexing', 'error', 'deleting', 'deleted', 'untracked'],
        default: 'ready',
        index: true
    },
    vectorSize: { type: Number, required: true },
    distance: { type: String, default: 'Cosine' },
    files: { type: [QdrantFileSchema], default: [] },
    error: { type: String, default: '' }
}, {
    timestamps: true
});

QdrantCollectionSchema.index({ 'files.fileName': 1 });
QdrantCollectionSchema.index({ collectionName: 'text', displayName: 'text', courseId: 'text', curso: 'text', 'files.fileName': 'text' });

export const QdrantCollection = model('QdrantCollection', QdrantCollectionSchema, 'kika_qdrant_collections');
