// src/controllers/tutor.controller.js
import { getTutorResponse } from '../service/tutor.service.js';
import { Interaction } from '../models/interaction.model.js';

const persistInteraction = (data) => {
    Interaction.create(data).catch(err => {
        console.error('Error al guardar interaccion en MongoDB:', err);
    });
};

export const askTutor = async (req, res) => {
    const { "course id": courseId, curso, vs_id_QDRANT: vsIdQdrant, prompt } = req.body;

    try {
        const respuestaText = await getTutorResponse({ curso, vsIdQdrant, prompt });

        res.status(200).json({
            "course id": courseId,
            "curso": curso,
            "vs_id_qdrant": vsIdQdrant,
            "respuesta": respuestaText
        });

        persistInteraction({
            courseId,
            curso,
            vsIdQdrant,
            prompt,
            respuesta: respuestaText
        });
    } catch (error) {
        console.error('Error en el agente Tutor:', error);

        const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 500;
        const respuestaError = statusCode === 500
            ? 'Error: No se pudo generar una respuesta en este momento.'
            : 'Error: La solicitud no se pudo procesar.';

        res.status(statusCode).json({
            "course id": courseId,
            "curso": curso,
            "vs_id_qdrant": vsIdQdrant,
            "respuesta": respuestaError
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
