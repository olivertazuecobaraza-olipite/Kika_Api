// src/middlewares/validator.middleware.js
import { body, header, param, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';

const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH || 4000);
const MAX_CONVERSATION_TITLE_LENGTH = Number(process.env.MAX_CONVERSATION_TITLE_LENGTH || 80);

const courseValidators = () => [
    body('course id')
        .isString().withMessage('course id debe ser texto')
        .trim()
        .notEmpty().withMessage('course id es requerido')
        .isLength({ max: 64 }).withMessage('course id no puede superar 64 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('course id contiene caracteres no permitidos'),
    body('curso')
        .isString().withMessage('curso debe ser texto')
        .trim()
        .notEmpty().withMessage('curso es requerido')
        .isLength({ max: 64 }).withMessage('curso no puede superar 64 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('curso contiene caracteres no permitidos'),
    body('vs_id_QDRANT')
        .isString().withMessage('vs_id_QDRANT debe ser texto')
        .trim()
        .notEmpty().withMessage('vs_id_QDRANT es requerido')
        .isLength({ max: 128 }).withMessage('vs_id_QDRANT no puede superar 128 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('vs_id_QDRANT contiene caracteres no permitidos'),
];

const promptValidator = () => body('prompt')
    .isString().withMessage('prompt debe ser texto')
    .trim()
    .notEmpty().withMessage('El prompt no puede estar vacio')
    .isLength({ max: MAX_PROMPT_LENGTH }).withMessage(`El prompt no puede superar ${MAX_PROMPT_LENGTH} caracteres`);

const optionalWebSearchValidator = () => body('web_search')
    .optional()
    .isBoolean().withMessage('web_search debe ser booleano');

const optionalTitleValidator = () => body('title')
    .optional()
    .isString().withMessage('title debe ser texto')
    .trim()
    .isLength({ max: MAX_CONVERSATION_TITLE_LENGTH }).withMessage(`title no puede superar ${MAX_CONVERSATION_TITLE_LENGTH} caracteres`);

const requiredTitleValidator = () => body('title')
    .exists({ values: 'undefined' }).withMessage('title es requerido')
    .isString().withMessage('title debe ser texto')
    .trim()
    .notEmpty().withMessage('title no puede estar vacio')
    .isLength({ max: MAX_CONVERSATION_TITLE_LENGTH }).withMessage(`title no puede superar ${MAX_CONVERSATION_TITLE_LENGTH} caracteres`);

const userIdValidator = () => header('x-user-id')
    .isString().withMessage('x-user-id debe ser texto')
    .trim()
    .notEmpty().withMessage('x-user-id es requerido')
    .isLength({ max: 64 }).withMessage('x-user-id no puede superar 64 caracteres')
    .matches(/^[A-Za-z0-9_-]+$/).withMessage('x-user-id contiene caracteres no permitidos');

const conversationIdValidator = () => param('conversationId')
    .custom(value => mongoose.isValidObjectId(value))
    .withMessage('conversationId debe ser un ObjectId valido');

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

export const validateTutorRequest = [
    ...courseValidators(),
    promptValidator(),
    optionalWebSearchValidator(),
    sendValidationErrors
];

export const validateCreateConversation = [
    userIdValidator(),
    ...courseValidators(),
    optionalTitleValidator(),
    sendValidationErrors
];

export const validateListConversations = [
    userIdValidator(),
    query('course_id')
        .optional()
        .isString().withMessage('course_id debe ser texto')
        .trim()
        .notEmpty().withMessage('course_id no puede estar vacio')
        .isLength({ max: 64 }).withMessage('course_id no puede superar 64 caracteres')
        .matches(/^[A-Za-z0-9_-]+$/).withMessage('course_id contiene caracteres no permitidos'),
    sendValidationErrors
];

export const validateConversationId = [
    userIdValidator(),
    conversationIdValidator(),
    sendValidationErrors
];

export const validateConversationMessage = [
    userIdValidator(),
    conversationIdValidator(),
    promptValidator(),
    optionalWebSearchValidator(),
    sendValidationErrors
];

export const validateRenameConversation = [
    userIdValidator(),
    conversationIdValidator(),
    requiredTitleValidator(),
    sendValidationErrors
];
