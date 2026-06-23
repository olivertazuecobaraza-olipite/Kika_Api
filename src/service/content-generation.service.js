import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { getTutorResponse } from './tutor.service.js';
import { buildGenerationPrompt } from './generation-prompts.service.js';

const DEFAULT_TITLE = 'Nueva conversaciÃ³n';
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 12);
const MAX_CONVERSATION_TITLE_LENGTH = Number(process.env.MAX_CONVERSATION_TITLE_LENGTH || 80);

const publicError = ({ name, status, publicMessage }) => {
    const error = new Error(publicMessage);
    error.name = name;
    error.status = status;
    error.publicMessage = publicMessage;
    return error;
};

const titlePrefixes = {
    resumen: 'Resumen',
    examen: 'Examen',
    ejercicio: 'Ejercicio'
};

export const buildUserGenerationMessage = (type, payload) => (
    `Generar ${type}: ${payload.tema}`
);

const buildTitle = (type, tema) => {
    const title = `${titlePrefixes[type]}: ${tema}`.trim();
    return title.length > MAX_CONVERSATION_TITLE_LENGTH
        ? title.slice(0, MAX_CONVERSATION_TITLE_LENGTH).trim()
        : title;
};

const serializeGenerationResponse = ({ conversationId, type, tutorResponse }) => ({
    conversation_id: conversationId.toString(),
    tipo_generacion: type,
    respuesta: tutorResponse.respuesta,
    web_search_used: tutorResponse.webSearchUsed,
    fuentes: tutorResponse.sources
});

const getRecentHistory = async ({ MessageModel, conversationId, before }) => {
    const previousMessages = await MessageModel.find({
        conversationId,
        createdAt: { $lt: before }
    })
        .sort({ createdAt: -1 })
        .limit(MAX_HISTORY_MESSAGES)
        .lean();

    return previousMessages
        .reverse()
        .map(message => ({
            role: message.role,
            content: message.content
        }));
};

export const generateConversationContent = async ({
    userId,
    conversationId,
    type,
    payload,
    webSearch = false,
    deps = {}
}) => {
    const ConversationModel = deps.ConversationModel || Conversation;
    const MessageModel = deps.MessageModel || Message;
    const tutorResponder = deps.getTutorResponse || getTutorResponse;

    const conversation = await ConversationModel.findOne({ _id: conversationId, userId });
    if (!conversation) {
        throw publicError({
            name: 'ConversationNotFoundError',
            status: 404,
            publicMessage: 'Conversacion no encontrada.'
        });
    }

    const userMessage = await MessageModel.create({
        conversationId: conversation._id,
        role: 'user',
        content: buildUserGenerationMessage(type, payload)
    });

    const history = await getRecentHistory({
        MessageModel,
        conversationId: conversation._id,
        before: userMessage.createdAt
    });

    const prompt = buildGenerationPrompt(type, payload);
    const tutorResponse = await tutorResponder({
        curso: conversation.curso,
        vsIdQdrant: conversation.vsIdQdrant,
        prompt,
        history,
        webSearch
    });
    const assistantMessage = await MessageModel.create({
        conversationId: conversation._id,
        role: 'assistant',
        content: tutorResponse.respuesta,
        webSearchUsed: tutorResponse.webSearchUsed,
        sources: tutorResponse.sources
    });

    const updates = {
        updatedAt: assistantMessage.createdAt,
        lastMessageAt: assistantMessage.createdAt
    };

    if (conversation.title === DEFAULT_TITLE) {
        updates.title = buildTitle(type, payload.tema);
    }

    await ConversationModel.updateOne({ _id: conversation._id }, { $set: updates });

    return serializeGenerationResponse({
        conversationId: conversation._id,
        type,
        tutorResponse
    });
};
