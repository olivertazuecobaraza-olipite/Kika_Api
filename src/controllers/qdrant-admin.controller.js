import {
    createCollection,
    deleteCollection,
    deleteFileById,
    deleteFileByName,
    getCollection,
    getCollectionFiles,
    listManagedCollections,
    syncCollections,
    uploadMultipleFiles,
    uploadSingleFile
} from '../service/qdrant-admin.service.js';

const sendError = (res, error) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        ? error.status
        : 500;

    res.status(status).json({
        error: status === 500
            ? 'Error interno al gestionar Qdrant.'
            : error.publicMessage || error.message
    });
};

export const listCollections = async (req, res) => {
    try {
        const result = await listManagedCollections({
            page: req.query.page,
            pageSize: req.query.page_size,
            courseId: req.query.course_id,
            curso: req.query.curso,
            fileName: req.query.file_name,
            search: req.query.search
        });
        res.status(200).json(result);
    } catch (error) {
        sendError(res, error);
    }
};

export const syncQdrantCollections = async (req, res) => {
    try {
        res.status(200).json(await syncCollections());
    } catch (error) {
        sendError(res, error);
    }
};

export const getCollectionDetails = async (req, res) => {
    try {
        res.status(200).json(await getCollection(req.params.collectionName));
    } catch (error) {
        sendError(res, error);
    }
};

export const getFiles = async (req, res) => {
    try {
        res.status(200).json(await getCollectionFiles(req.params.collectionName));
    } catch (error) {
        sendError(res, error);
    }
};

export const createQdrantCollection = async (req, res) => {
    try {
        const result = await createCollection({
            collectionName: req.body.collection_name,
            displayName: req.body.display_name,
            courseId: req.body.course_id,
            curso: req.body.curso
        });
        res.status(201).json(result);
    } catch (error) {
        sendError(res, error);
    }
};

export const uploadFile = async (req, res) => {
    try {
        const result = await uploadSingleFile({
            collectionName: req.params.collectionName,
            file: req.file,
            courseId: req.body.course_id,
            curso: req.body.curso,
            replaceExisting: req.body.replace_existing === 'true' || req.body.replace_existing === true
        });
        res.status(201).json(result);
    } catch (error) {
        sendError(res, error);
    }
};

export const uploadFiles = async (req, res) => {
    try {
        const result = await uploadMultipleFiles({
            collectionName: req.params.collectionName,
            files: req.files,
            courseId: req.body.course_id,
            curso: req.body.curso,
            replaceExisting: req.body.replace_existing === 'true' || req.body.replace_existing === true
        });
        res.status(result.failed.length > 0 && result.uploaded.length === 0 ? 400 : 201).json(result);
    } catch (error) {
        sendError(res, error);
    }
};

export const removeFileById = async (req, res) => {
    try {
        res.status(200).json(await deleteFileById({
            collectionName: req.params.collectionName,
            fileId: req.params.fileId
        }));
    } catch (error) {
        sendError(res, error);
    }
};

export const removeFileByName = async (req, res) => {
    try {
        res.status(200).json(await deleteFileByName({
            collectionName: req.params.collectionName,
            fileName: req.query.file_name
        }));
    } catch (error) {
        sendError(res, error);
    }
};

export const removeCollection = async (req, res) => {
    try {
        res.status(200).json(await deleteCollection({
            collectionName: req.params.collectionName,
            confirm: req.query.confirm === 'true'
        }));
    } catch (error) {
        sendError(res, error);
    }
};
