import { Router } from 'express';
import {
    createQdrantCollection,
    getCollectionDetails,
    getFiles,
    listCollections,
    removeCollection,
    removeFileById,
    removeFileByName,
    syncQdrantCollections,
    uploadFile,
    uploadFiles
} from '../controllers/qdrant-admin.controller.js';
import {
    qdrantUpload,
    validateCreateQdrantCollection,
    validateDeleteQdrantCollection,
    validateDeleteQdrantFileByName,
    validateListQdrantCollections,
    validateQdrantCollectionName,
    validateQdrantFileId,
    validateQdrantUploadFields
} from '../middlewares/qdrant-admin.middleware.js';

const router = Router();

router.get('/collections', validateListQdrantCollections, listCollections);
router.post('/collections/sync', syncQdrantCollections);
router.post('/collections', validateCreateQdrantCollection, createQdrantCollection);
router.get('/collections/:collectionName', validateQdrantCollectionName, getCollectionDetails);
router.get('/collections/:collectionName/files', validateQdrantCollectionName, getFiles);
router.post(
    '/collections/:collectionName/files',
    validateQdrantCollectionName,
    qdrantUpload.single('file'),
    validateQdrantUploadFields,
    uploadFile
);
router.post(
    '/collections/:collectionName/files/batch',
    validateQdrantCollectionName,
    qdrantUpload.array('files'),
    validateQdrantUploadFields,
    uploadFiles
);
router.delete('/collections/:collectionName/files/by-name', validateDeleteQdrantFileByName, removeFileByName);
router.delete('/collections/:collectionName/files/:fileId', validateQdrantFileId, removeFileById);
router.delete('/collections/:collectionName', validateDeleteQdrantCollection, removeCollection);

export default router;
