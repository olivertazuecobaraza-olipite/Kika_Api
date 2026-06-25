const WEB_SEARCH_TRIGGER_TEST_REGEX = /\bbusca\s+en\s+internet\b/i;

export const shouldUseWebSearch = ({ prompt, webSearch = false }) => (
    webSearch === true || WEB_SEARCH_TRIGGER_TEST_REGEX.test(prompt)
);
