import assert from 'node:assert/strict';
import test from 'node:test';
process.env.OPENAI_API_KEY ||= 'test-openai-api-key';

const {
    appendWebSourcesHtml,
    cleanWebSearchTrigger,
    getTutorResponse,
    getWebResponse,
    normalizeWebSources,
    shouldUseWebSearch
} = await import('../src/service/tutor.service.js');

test('activa busqueda web por frase incluida sin distinguir mayusculas', () => {
    assert.equal(shouldUseWebSearch({ prompt: 'Explica esto. BUSCA EN INTERNET ahora.' }), true);
    assert.equal(shouldUseWebSearch({ prompt: 'Explica esto sin fuentes externas.' }), false);
});

test('activa busqueda web por booleano y false no desactiva la frase', () => {
    assert.equal(shouldUseWebSearch({ prompt: 'Consulta normal', webSearch: true }), true);
    assert.equal(shouldUseWebSearch({ prompt: 'Busca en internet normativa', webSearch: false }), true);
});

test('limpia todas las apariciones de la frase de control', () => {
    assert.equal(
        cleanWebSearchTrigger('Busca en internet normativa. BUSCA EN INTERNET'),
        'normativa.'
    );
    assert.equal(cleanWebSearchTrigger('Busca en internet'), '');
});

test('rechaza una frase de control sin consulta', async () => {
    await assert.rejects(
        getTutorResponse({
            curso: 'curso',
            vsIdQdrant: 'collection',
            prompt: 'Busca en internet'
        }),
        error => error.status === 400 && error.name === 'EmptyWebSearchPromptError'
    );
});

test('normaliza, enriquece y deduplica fuentes http y https', () => {
    assert.deepEqual(
        normalizeWebSources({
            citations: ['https://example.com/a', 'javascript:alert(1)', 'https://example.com/a'],
            searchResults: [
                { title: 'Fuente A', url: 'https://example.com/a', date: '2026-05-20' },
                { title: 'Fuente B', url: 'http://example.com/b', last_updated: '2026-05-21' }
            ]
        }),
        [
            { titulo: 'Fuente A', url: 'https://example.com/a', fecha: '2026-05-20' },
            { titulo: 'Fuente B', url: 'http://example.com/b', fecha: '2026-05-21' }
        ]
    );
});

test('anade fuentes escapadas al HTML', () => {
    const html = appendWebSourcesHtml('<p>Respuesta</p>', [{
        titulo: '<Fuente>',
        url: 'https://example.com/?a=1&b=2',
        fecha: '2026-05-20'
    }]);

    assert.match(html, /<h3>Fuentes de internet<\/h3>/);
    assert.match(html, /&lt;Fuente&gt;/);
    assert.match(html, /a=1&amp;b=2/);
});

test('devuelve 503 si Perplexity no esta configurado', async () => {
    await assert.rejects(
        getWebResponse({
            curso: 'curso',
            context: '',
            prompt: 'consulta',
            perplexityClient: null
        }),
        error => error.status === 503 && error.name === 'WebSearchConfigurationError'
    );
});

test('convierte errores de Perplexity en 502', async () => {
    const perplexityClient = {
        chat: {
            completions: {
                create: async () => {
                    throw new Error('provider failure');
                }
            }
        }
    };

    await assert.rejects(
        getWebResponse({
            curso: 'curso',
            context: '',
            prompt: 'consulta',
            perplexityClient
        }),
        error => error.status === 502 && error.name === 'WebSearchProviderError'
    );
});

test('genera respuesta web con metadatos y fuentes visibles', async () => {
    const perplexityClient = {
        chat: {
            completions: {
                create: async () => ({
                    citations: ['https://example.com/a'],
                    search_results: [{ title: 'Fuente A', url: 'https://example.com/a' }],
                    choices: [{ message: { content: '<p>Respuesta web</p>' } }]
                })
            }
        }
    };
    const response = await getWebResponse({
        curso: 'curso',
        context: 'contexto',
        prompt: 'consulta',
        perplexityClient
    });

    assert.equal(response.webSearchUsed, true);
    assert.equal(response.sources.length, 1);
    assert.match(response.respuesta, /<p>Respuesta web<\/p>/);
    assert.match(response.respuesta, /<h3>Fuentes de internet<\/h3>/);
});
