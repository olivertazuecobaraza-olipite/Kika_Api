import { generateConversationContent } from '../service/content-generation.service.js';

const getUserId = (req) => req.get('x-user-id');

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createErrorHtml = (message) => `<section><h2>Error</h2><p>${escapeHtml(message)}</p></section>`;

export const sendGenerationError = (res, error) => {
    const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    const respuestaError = statusCode === 500
        ? 'Error: No se pudo generar una respuesta en este momento.'
        : `Error: ${error.publicMessage || 'La solicitud no se pudo procesar.'}`;

    return res.status(statusCode).json({
        respuesta: createErrorHtml(respuestaError),
        web_search_used: false,
        fuentes: []
    });
};

const createGenerationHandler = ({ type, allowWebSearch = false }) => async (req, res) => {
    try {
        const result = await generateConversationContent({
            userId: getUserId(req),
            conversationId: req.params.conversationId,
            type,
            payload: req.body,
            webSearch: allowWebSearch ? req.body.web_search === true : false
        });

        res.status(200).json(result);
    } catch (error) {
        console.error(`Error al generar ${type}:`, error);
        sendGenerationError(res, error);
    }
};

export const createSummary = createGenerationHandler({ type: 'resumen', allowWebSearch: true });
export const createExam = createGenerationHandler({ type: 'examen' });
export const createExercise = createGenerationHandler({ type: 'ejercicio' });
