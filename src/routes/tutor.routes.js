// src/routes/tutor.routes.js
import { Router } from 'express';
import { askTutor } from '../controllers/tutor.controller.js';
import {
    createConversation,
    deleteConversation,
    getConversationMessages,
    listConversations,
    renameConversation,
    sendConversationMessage
} from '../controllers/conversation.controller.js';
import {
    validateConversationId,
    validateConversationMessage,
    validateCreateConversation,
    validateListConversations,
    validateRenameConversation,
    validateTutorRequest
} from '../middlewares/validator.middleware.js';

const router = Router();

// Endpoint del tutor
router.post('/ask', validateTutorRequest, askTutor);
router.post('/conversations', validateCreateConversation, createConversation);
router.get('/conversations', validateListConversations, listConversations);
router.get('/conversations/:conversationId/messages', validateConversationId, getConversationMessages);
router.post('/conversations/:conversationId/messages', validateConversationMessage, sendConversationMessage);
router.patch('/conversations/:conversationId', validateRenameConversation, renameConversation);
router.delete('/conversations/:conversationId', validateConversationId, deleteConversation);

export default router;
