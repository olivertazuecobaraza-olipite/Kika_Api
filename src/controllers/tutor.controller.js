// src/controllers/tutor.controller.js
import { getTutorResponse } from '../service/tutor.service.js';
import { Interaction } from '../models/interaction.model.js';

const persistInteraction = (data) => {
    Interaction.create(data).catch(err => {
        console.error('Error al guardar interaccion en MongoDB:', err);
    });
};

export const askTutor = async (req, res) => {
    const { "course id": courseId, curso, vs_id_QDRANT: vsIdQdrant, prompt, web_search: webSearch } = req.body;

    try {
        const tutorResponse = await getTutorResponse({ curso, vsIdQdrant, prompt, webSearch });

        res.status(200).json({
            "course id": courseId,
            "curso": curso,
            "vs_id_qdrant": vsIdQdrant,
            "respuesta": tutorResponse.respuesta,
            "web_search_used": tutorResponse.webSearchUsed,
            "fuentes": tutorResponse.sources
        });

        persistInteraction({
            courseId,
            curso,
            vsIdQdrant,
            prompt,
            respuesta: tutorResponse.respuesta,
            webSearchUsed: tutorResponse.webSearchUsed,
            sources: tutorResponse.sources
        });
    } catch (error) {
        console.error('Error en el agente Tutor:', error);

        const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 500;
        const respuestaError = statusCode === 500
            ? 'Error: No se pudo generar una respuesta en este momento.'
            : `Error: ${error.publicMessage || 'La solicitud no se pudo procesar.'}`;

        res.status(statusCode).json({
            "course id": courseId,
            "curso": curso,
            "vs_id_qdrant": vsIdQdrant,
            "respuesta": respuestaError,
            "web_search_used": false,
            "fuentes": []
        });

        persistInteraction({
            courseId,
            curso,
            vsIdQdrant,
            prompt,
            respuesta: respuestaError
        });
    }
};
