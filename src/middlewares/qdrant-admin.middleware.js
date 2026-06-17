import multer from 'multer';
import { body, param, query, validationResult } from 'express-validator';

const MAX_FILE_SIZE_MB = Number(process.env.QDRANT_UPLOAD_MAX_FILE_SIZE_MB || 25);
const MAX_FILES = Number(process.env.QDRANT_UPLOAD_MAX_FILES || 10);
const MAX_PAGE_SIZE = Number(process.env.QDRANT_ADMIN_MAX_PAGE_SIZE || 50);

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
]);

const collectionNameValidator = (source = param('collectionName')) => source
    .isString().withMessage('collectionName debe ser texto')
    .trim()
    .notEmpty().withMessage('collectionName es requerido')
    .isLength({ max: 128 }).withMessage('collectionName no puede superar 128 caracteres')
    .matches(/^[A-Za-z0-9_-]+$/).withMessage('collectionName contiene caracteres no permitidos');

const optionalCourseId = () => body('course_id')
    .optional()
    .isString().withMessage('course_id debe ser texto')
    .trim()
    .isLength({ max: 64 }).withMessage('course_id no puede superar 64 caracteres')
    .matches(/^[A-Za-z0-9_-]*$/).withMessage('course_id contiene caracteres no permitidos');

const optionalCurso = () => body('curso')
    .optional()
    .isString().withMessage('curso debe ser texto')
    .trim()
    .isLength({ max: 64 }).withMessage('curso no puede superar 64 caracteres')
    .matches(/^[A-Za-z0-9_-]*$/).withMessage('curso contiene caracteres no permitidos');

const sendValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg
            }))
        });
    }
    next();
};

export const qdrantUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
        files: MAX_FILES
    },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
    }
});

export const validateListQdrantCollections = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('page debe ser un entero positivo'),
    query('page_size')
        .optional()
        .isInt({ min: 1, max: MAX_PAGE_SIZE }).withMessage(`page_size debe estar entre 1 y ${MAX_PAGE_SIZE}`),
    query('course_id')
        .optional()
        .isString().withMessage('course_id debe ser texto')
        .trim()
        .isLength({ max: 64 }).withMessage('course_id no puede superar 64 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('course_id contiene caracteres no permitidos'),
    query('curso')
        .optional()
        .isString().withMessage('curso debe ser texto')
        .trim()
        .isLength({ max: 64 }).withMessage('curso no puede superar 64 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('curso contiene caracteres no permitidos'),
    query('file_name')
        .optional()
        .isString().withMessage('file_name debe ser texto')
        .trim()
        .isLength({ max: 180 }).withMessage('file_name no puede superar 180 caracteres'),
    query('search')
        .optional()
        .isString().withMessage('search debe ser texto')
        .trim()
        .isLength({ max: 180 }).withMessage('search no puede superar 180 caracteres'),
    sendValidationErrors
];

export const validateCreateQdrantCollection = [
    collectionNameValidator(body('collection_name')),
    body('display_name')
        .optional()
        .isString().withMessage('display_name debe ser texto')
        .trim()
        .isLength({ max: 120 }).withMessage('display_name no puede superar 120 caracteres'),
    optionalCourseId(),
    optionalCurso(),
    sendValidationErrors
];

export const validateQdrantCollectionName = [
    collectionNameValidator(),
    sendValidationErrors
];

export const validateQdrantUploadFields = [
    optionalCourseId(),
    optionalCurso(),
    body('replace_existing')
        .optional()
        .isBoolean().withMessage('replace_existing debe ser booleano'),
    sendValidationErrors
];

export const validateQdrantFileId = [
    collectionNameValidator(),
    param('fileId')
        .isString().withMessage('fileId debe ser texto')
        .trim()
        .notEmpty().withMessage('fileId es requerido')
        .isLength({ max: 96 }).withMessage('fileId no puede superar 96 caracteres'),
    sendValidationErrors
];

export const validateDeleteQdrantFileByName = [
    collectionNameValidator(),
    query('file_name')
        .isString().withMessage('file_name debe ser texto')
        .trim()
        .notEmpty().withMessage('file_name es requerido')
        .isLength({ max: 180 }).withMessage('file_name no puede superar 180 caracteres'),
    sendValidationErrors
];

export const validateDeleteQdrantCollection = [
    collectionNameValidator(),
    query('confirm')
        .equals('true').withMessage('Para eliminar una coleccion debes enviar confirm=true.'),
    sendValidationErrors
];
