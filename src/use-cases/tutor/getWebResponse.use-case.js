import { perplexity } from '../../config/perplexity.js';
import { appendWebSourcesHtml } from './appendWebSourcesHtml.use-case.js';
import { detectResponseLanguage } from './detectResponseLanguage.use-case.js';
import { normalizeAssistantHtml } from './normalizeAssistantHtml.use-case.js';
import { normalizeWebSources } from './normalizeWebSources.use-case.js';
import { getWebInstructions } from './_internal/instructions.js';
import { createPublicError } from './_internal/public-error.js';

const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar';
const PERPLEXITY_TIMEOUT_MS = Number(process.env.PERPLEXITY_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 0);
const WEB_SEARCH_NOT_CONFIGURED_MESSAGE = 'La busqueda en internet no esta configurada.';
const WEB_SEARCH_UNAVAILABLE_MESSAGE = 'La busqueda en internet no esta disponible en este momento.';

const getPerplexityRequestOptions = () => PERPLEXITY_TIMEOUT_MS > 0
    ? { timeout: PERPLEXITY_TIMEOUT_MS }
    : undefined;

export const getWebResponse = async ({
    curso,
    context,
    prompt,
    history = [],
    responseLanguage = detectResponseLanguage(prompt),
    perplexityClient = perplexity
}) => {
    if (!perplexityClient) {
        throw createPublicError({
            name: 'WebSearchConfigurationError',
            status: 503,
            publicMessage: WEB_SEARCH_NOT_CONFIGURED_MESSAGE
        });
    }

    try {
        const chatCompletion = await perplexityClient.chat.completions.create({
            model: PERPLEXITY_MODEL,
            messages: [
                { role: 'system', content: await getWebInstructions({ curso, context, responseLanguage }) },
                ...history,
                { role: 'user', content: prompt }
            ]
        }, getPerplexityRequestOptions());
        const sources = normalizeWebSources({
            citations: chatCompletion.citations,
            searchResults: chatCompletion.search_results
        });
        const responseHtml = normalizeAssistantHtml(chatCompletion.choices[0]?.message?.content);
        const responseWithSources = appendWebSourcesHtml(responseHtml, sources, responseLanguage);

        return {
            respuesta: normalizeAssistantHtml(responseWithSources),
            webSearchUsed: true,
            sources
        };
    } catch (err) {
        if (err?.status === 503 && err?.name === 'WebSearchConfigurationError') throw err;

        console.error('[TutorService] Error al consultar Perplexity Sonar:', err);
        throw createPublicError({
            name: 'WebSearchProviderError',
            status: 502,
            publicMessage: WEB_SEARCH_UNAVAILABLE_MESSAGE,
            cause: err
        });
    }
};
