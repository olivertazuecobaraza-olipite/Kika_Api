const WEB_SEARCH_TRIGGER_REGEX = /\bbusca\s+en\s+internet\b/gi;

export const cleanWebSearchTrigger = (prompt) => prompt
    .replace(WEB_SEARCH_TRIGGER_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
