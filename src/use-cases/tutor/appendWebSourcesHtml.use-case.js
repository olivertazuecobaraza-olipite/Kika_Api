import { getLocalizedCopy, LANGUAGE_PROFILES } from './_internal/localization.js';

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');


export const appendWebSourcesHtml = (responseHtml, sources, responseLanguage = LANGUAGE_PROFILES.es) => {
    if (sources.length === 0) return responseHtml;

    const copy = getLocalizedCopy(responseLanguage);
    const items = sources
        .map(source => {
            const title = escapeHtml(source.titulo);
            const url = escapeHtml(source.url);
            const date = source.fecha ? ` <span>${escapeHtml(source.fecha)}</span>` : '';
            return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>${date}</li>`;
        })
        .join('');

    return `${responseHtml}<section><h3>${copy.sourcesTitle}</h3><ul>${items}</ul></section>`;
};
