const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
    } catch {
        return false;
    }
};

export const normalizeWebSources = ({ citations = [], searchResults = [] } = {}) => {
    const resultsByUrl = new Map(
        searchResults
            .filter(result => isHttpUrl(result?.url))
            .map(result => [result.url, result])
    );
    const candidateUrls = [
        ...citations,
        ...searchResults.map(result => result?.url)
    ];
    const sourcesByUrl = new Map();

    candidateUrls.forEach(url => {
        if (!isHttpUrl(url) || sourcesByUrl.has(url)) return;

        const result = resultsByUrl.get(url) || {};
        sourcesByUrl.set(url, {
            titulo: result.title || url,
            url,
            fecha: result.date || result.last_updated || ''
        });
    });

    return [...sourcesByUrl.values()];
};
