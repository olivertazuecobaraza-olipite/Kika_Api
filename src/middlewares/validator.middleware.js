// src/middlewares/validator.middleware.js
import { body, header, param, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { logPerf, markDuration, nowMs } from '../utils/perf.js';

const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH || 4000);
const MAX_CONVERSATION_TITLE_LENGTH = Number(process.env.MAX_CONVERSATION_TITLE_LENGTH || 80);
const MAX_ADDITIONAL_INSTRUCTIONS_LENGTH = Number(process.env.MAX_ADDITIONAL_INSTRUCTIONS_LENGTH || 1000);
const MAX_EXAM_QUESTIONS = Number(process.env.MAX_EXAM_QUESTIONS || 50);
const MAX_EXERCISE_SECTIONS = Number(process.env.MAX_EXERCISE_SECTIONS || 20);

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

const forbiddenWebSearchValidator = () => body('web_search')
    .not().exists().withMessage('web_search solo esta permitido en resumen');

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

const generationTopicValidator = () => body('tema')
    .isString().withMessage('tema debe ser texto')
    .trim()
    .notEmpty().withMessage('tema es requerido')
    .isLength({ max: MAX_PROMPT_LENGTH }).withMessage(`tema no puede superar ${MAX_PROMPT_LENGTH} caracteres`);

const optionalAdditionalInstructionsValidator = () => body('indicaciones_adicionales')
    .optional()
    .isString().withMessage('indicaciones_adicionales debe ser texto')
    .trim()
    .isLength({ max: MAX_ADDITIONAL_INSTRUCTIONS_LENGTH }).withMessage(`indicaciones_adicionales no puede superar ${MAX_ADDITIONAL_INSTRUCTIONS_LENGTH} caracteres`);

const enumValidator = (field, values) => body(field)
    .isString().withMessage(`${field} debe ser texto`)
    .trim()
    .isIn(values).withMessage(`${field} debe ser uno de: ${values.join(', ')}`);

const optionalZeroOrPositiveIntegerValidator = (field, max, message) => body(field)
    .optional()
    .isInt({ min: 0, max }).withMessage(message)
    .toInt();

const requiredPositiveIntegerValidator = (field, max, message) => body(field)
    .exists({ values: 'undefined' }).withMessage(`${field} es requerido`)
    .isInt({ min: 1, max }).withMessage(message)
    .toInt();

const validateExamQuestionCounts = body().custom((_, { req }) => {
    const tipo = req.body.tipo;
    const testCount = Number(req.body.numero_preguntas_test || 0);
    const openCount = Number(req.body.numero_preguntas_abiertas || 0);

    if (tipo === 'test' && (testCount <= 0 || openCount !== 0)) {
        throw new Error('Para tipo test, numero_preguntas_test debe ser mayor que 0 y numero_preguntas_abiertas debe ser 0 o no enviarse');
    }
    if (tipo === 'preguntas_abiertas' && (openCount <= 0 || testCount !== 0)) {
        throw new Error('Para preguntas_abiertas, numero_preguntas_abiertas debe ser mayor que 0 y numero_preguntas_test debe ser 0 o no enviarse');
    }
    if (tipo === 'mixto' && (testCount <= 0 || openCount <= 0)) {
        throw new Error('Para tipo mixto, ambos contadores de preguntas deben ser mayores que 0');
    }

    return true;
});

const sendValidationErrors = (req, res, next) => {
    const start = nowMs();
    const errors = validationResult(req);
    const duration = markDuration(start);
    if (!errors.isEmpty()) {
        logPerf('perf.validation', {
            path: req.originalUrl,
            status: 400,
            duration_ms: duration,
            errors: errors.array().length
        });
        return res.status(400).json({
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg
            }))
        });
    }
    logPerf('perf.validation', { path: req.originalUrl, status: 'ok', duration_ms: duration });
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

export const validateSummaryGeneration = [
    userIdValidator(),
    conversationIdValidator(),
    generationTopicValidator(),
    enumValidator('extension', ['breve', 'medio', 'detallado']),
    enumValidator('formato', ['parrafos', 'puntos_clave', 'esquema']),
    enumValidator('enfoque', ['conceptos_principales', 'para_estudiar', 'repaso_examen']),
    optionalAdditionalInstructionsValidator(),
    optionalWebSearchValidator(),
    sendValidationErrors
];

export const validateExamGeneration = [
    userIdValidator(),
    conversationIdValidator(),
    generationTopicValidator(),
    enumValidator('tipo', ['test', 'preguntas_abiertas', 'mixto']),
    optionalZeroOrPositiveIntegerValidator('numero_preguntas_test', MAX_EXAM_QUESTIONS, `numero_preguntas_test debe ser un entero entre 0 y ${MAX_EXAM_QUESTIONS}`),
    optionalZeroOrPositiveIntegerValidator('numero_preguntas_abiertas', MAX_EXAM_QUESTIONS, `numero_preguntas_abiertas debe ser un entero entre 0 y ${MAX_EXAM_QUESTIONS}`),
    enumValidator('nivel_dificultad', ['basico', 'intermedio', 'avanzado']),
    optionalAdditionalInstructionsValidator(),
    forbiddenWebSearchValidator(),
    validateExamQuestionCounts,
    sendValidationErrors
];

export const validateExerciseGeneration = [
    userIdValidator(),
    conversationIdValidator(),
    generationTopicValidator(),
    enumValidator('tipo', ['practica_guiada', 'caso_aplicado', 'preguntas', 'actividad_creativa']),
    enumValidator('nivel_dificultad', ['basico', 'intermedio', 'avanzado']),
    requiredPositiveIntegerValidator('apartados', MAX_EXERCISE_SECTIONS, `apartados debe ser un entero entre 1 y ${MAX_EXERCISE_SECTIONS}`),
    body('incluir_solucion')
        .exists({ values: 'undefined' }).withMessage('incluir_solucion es requerido')
        .isBoolean().withMessage('incluir_solucion debe ser booleano')
        .toBoolean(),
    optionalAdditionalInstructionsValidator(),
    forbiddenWebSearchValidator(),
    sendValidationErrors
];
