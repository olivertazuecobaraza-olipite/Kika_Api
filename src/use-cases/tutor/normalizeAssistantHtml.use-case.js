const HTML_FRAGMENT_TAG_REGEX = /<\/?(?:section|article|div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|strong|em|blockquote|pre|code|a|span|br)\b/i;
const BLOCK_TAG = '(?:section|article|div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre)';
const EMPTY_PARAGRAPH_REGEX = /<p\b[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/p>/gi;
const REPEATED_BREAK_REGEX = /(?:<br\s*\/?>\s*){2,}/gi;

const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const compactHtml = (value) => value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(EMPTY_PARAGRAPH_REGEX, '')
    .replace(REPEATED_BREAK_REGEX, '<br>')
    .replace(new RegExp(`(<\\/?${BLOCK_TAG}\\b[^>]*>)\\s+`, 'gi'), '$1')
    .replace(new RegExp(`\\s+(<\\/?${BLOCK_TAG}\\b[^>]*>)`, 'gi'), '$1')
    .replace(/ {2,}/g, ' ')
    .trim();

export const normalizeAssistantHtml = (value, fallbackText = 'No pude generar una respuesta.') => {
    const raw = String(value || '').trim();
    if (!raw) return `<section><p>${escapeHtml(fallbackText)}</p></section>`;

    if (HTML_FRAGMENT_TAG_REGEX.test(raw)) {
        const compacted = compactHtml(raw);
        return compacted || `<section><p>${escapeHtml(fallbackText)}</p></section>`;
    }

    const paragraphs = raw
        .split(/\n{2,}/)
        .map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean);
    const content = (paragraphs.length > 0 ? paragraphs : [fallbackText])
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');

    return `<section>${content}</section>`;
};
