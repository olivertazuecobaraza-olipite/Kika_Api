import { detectResponseLanguage } from './detectResponseLanguage.use-case.js';
import { escapeHtml, getLocalizedCopy } from './_internal/localization.js';

const escapeResponseText = escapeHtml;

export const createInsufficientContextResponse = (prompt, responseLanguage = detectResponseLanguage(prompt)) => {
    const question = escapeResponseText(prompt);
    const copy = getLocalizedCopy(responseLanguage);
    return `<section><h2>${copy.unavailableTitle}</h2><p>${copy.unavailableBody} <strong>${question}</strong>.</p><p>${copy.unavailableHint}</p></section>`;
};
