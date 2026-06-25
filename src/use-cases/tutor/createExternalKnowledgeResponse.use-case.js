import { detectResponseLanguage } from './detectResponseLanguage.use-case.js';
import { getLocalizedCopy } from './_internal/localization.js';

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeResponseText = escapeHtml;

export const createExternalKnowledgeResponse = (prompt, responseLanguage = detectResponseLanguage(prompt)) => {
    const question = escapeResponseText(prompt);
    const copy = getLocalizedCopy(responseLanguage);
    return `<section><h2>${copy.externalTitle}</h2><p>${copy.externalBody} <strong>${question}</strong>.</p><p>${copy.externalHint}</p></section>`;
};
