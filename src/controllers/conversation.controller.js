import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { cleanWebSearchTrigger, getTutorResponse } from '../service/tutor.service.js';

const DEFAULT_TITLE = 'Nueva conversación';
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 12);
const MAX_CONVERSATION_TITLE_LENGTH = Number(process.env.MAX_CONVERSATION_TITLE_LENGTH || 80);

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createErrorHtml = (message) => `<section><h2>Error</h2><p>${escapeHtml(message)}</p></section>`;

const getUserId = (req) => req.get('x-user-id');

const selectHistoryFields = (query) => typeof query.select === 'function'
    ? query.select('role content createdAt')
    : query;

const serializeConversationCore = (conversation) => ({
    conversation_id: conversation._id.toString(),
    title: conversation.title,
    'course id': conversation.courseId,
    curso: conversation.curso,
    vs_id_qdrant: conversation.vsIdQdrant
});

const serializeConversation = (conversation) => ({
    ...serializeConversationCore(conversation),
    last_message_at: conversation.lastMessageAt,
    created_at: conversation.createdAt
});

const buildTitleFromPrompt = (prompt) => {
    const normalized = cleanWebSearchTrigger(prompt);
    if (!normalized) return DEFAULT_TITLE;
    return normalized.length > MAX_CONVERSATION_TITLE_LENGTH
        ? normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH).trim()
        : normalized;
};

export const createConversation = async (req, res) => {
    const userId = getUserId(req);
    const { 'course id': courseId, curso, vs_id_QDRANT: vsIdQdrant, title } = req.body;
    const now = new Date();

    const conversation = await Conversation.create({
        userId,
        courseId,
        curso,
        vsIdQdrant,
        title: title || DEFAULT_TITLE,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now
    });

    res.status(201).json(serializeConversationCore(conversation));
};

export const listConversations = async (req, res) => {
    const userId = getUserId(req);
    const { course_id: courseId } = req.query;
    const filter = { userId };

    if (courseId) {
        filter.courseId = courseId;
    }

    const conversations = await Conversation.find(filter)
        .sort({ lastMessageAt: -1 })
        .lean();

    res.status(200).json({
        conversations: conversations.map(serializeConversation)
    });
};

export const getConversationMessages = async (req, res) => {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const conversation = await Conversation.findOne({ _id: conversationId, userId }).lean();

    if (!conversation) {
        return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    const messages = await Message.find({ conversationId })
        .sort({ createdAt: 1 })
        .lean();

    res.status(200).json({
        conversation_id: conversation._id.toString(),
        messages: messages.map(message => ({
            role: message.role,
            content: message.content,
            web_search_used: message.webSearchUsed || false,
            fuentes: message.sources || [],
            created_at: message.createdAt
        }))
    });
};

export const sendConversationMessage = async (req, res) => {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const { prompt, web_search: webSearch } = req.body;
    const conversation = await Conversation.findOne({ _id: conversationId, userId });

    if (!conversation) {
        return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    const userMessage = await Message.create({
        conversationId: conversation._id,
        role: 'user',
        content: prompt
    });

    try {
        const previousMessagesQuery = Message.find({
            conversationId: conversation._id,
            createdAt: { $lt: userMessage.createdAt }
        })
            .sort({ createdAt: -1 })
            .limit(MAX_HISTORY_MESSAGES);
        const previousMessages = await selectHistoryFields(previousMessagesQuery).lean();

        const history = previousMessages
            .reverse()
            .map(message => ({
                role: message.role,
                content: message.content
            }));

        const tutorResponse = await getTutorResponse({
            curso: conversation.curso,
            vsIdQdrant: conversation.vsIdQdrant,
            prompt,
            history,
            webSearch
        });

        const assistantMessage = await Message.create({
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
            const generatedTitle = buildTitleFromPrompt(prompt);
            if (generatedTitle !== DEFAULT_TITLE) {
                updates.title = generatedTitle;
            }
        }

        await Conversation.updateOne({ _id: conversation._id }, { $set: updates });

        res.status(200).json({
            conversation_id: conversation._id.toString(),
            respuesta: tutorResponse.respuesta,
            web_search_used: tutorResponse.webSearchUsed,
            fuentes: tutorResponse.sources
        });
    } catch (error) {
        console.error('Error en conversacion del agente Tutor:', error);
        await Conversation.updateOne(
            { _id: conversation._id },
            { $set: { updatedAt: userMessage.createdAt, lastMessageAt: userMessage.createdAt } }
        );

        const statusCode = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 500;
        const respuestaError = statusCode === 500
            ? 'Error: No se pudo generar una respuesta en este momento.'
            : `Error: ${error.publicMessage || 'La solicitud no se pudo procesar.'}`;

        res.status(statusCode).json({
            conversation_id: conversation._id.toString(),
            respuesta: createErrorHtml(respuestaError),
            web_search_used: false,
            fuentes: []
        });
    }
};

export const renameConversation = async (req, res) => {
    const userId = getUserId(req);
    const { conversationId } = req.params;
    const { title } = req.body;

    const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, userId },
        { $set: { title, updatedAt: new Date() } },
        { new: true }
    );

    if (!conversation) {
        return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    res.status(200).json(serializeConversation(conversation));
};

export const deleteConversation = async (req, res) => {
    const userId = getUserId(req);
    const { conversationId } = req.params;

    const conversation = await Conversation.findOneAndDelete({ _id: conversationId, userId });
    if (!conversation) {
        return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    await Message.deleteMany({ conversationId: conversation._id });

    res.status(204).send();
};
