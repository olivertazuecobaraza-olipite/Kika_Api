import assert from 'node:assert/strict';
import test from 'node:test';
process.env.OPENAI_API_KEY ||= 'test-openai-api-key';

const {
    appendWebSourcesHtml,
    buildCollectionSummaryContext,
    buildStructuralContext,
    classifyTutorPrompt,
    cleanWebSearchTrigger,
    createExternalKnowledgeResponse,
    createInsufficientContextResponse,
    detectResponseLanguage,
    extractTrainingCatalog,
    getTutorResponse,
    getWebResponse,
    hasSufficientDocumentContext,
    isAmbiguousDocumentQuestion,
    isStructuralQuestion,
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

test('detecta idioma de respuesta por instruccion explicita e idioma principal', () => {
    assert.deepEqual(
        {
            localeHint: detectResponseLanguage('how are u?').localeHint,
            explicitOverride: detectResponseLanguage('how are u?').explicitOverride
        },
        { localeHint: 'en', explicitOverride: false }
    );
    assert.equal(detectResponseLanguage('olá, como estás?').localeHint, 'pt');
    assert.equal(detectResponseLanguage('hello, explícame el módulo 1').localeHint, 'es');

    const explicit = detectResponseLanguage('responde en francés: what can you do?');
    assert.equal(explicit.localeHint, 'fr');
    assert.equal(explicit.explicitOverride, true);
});

test('clasifica smalltalk, ayuda, identidad, documental y conocimiento externo', () => {
    assert.equal(classifyTutorPrompt('how are u?'), 'smalltalk');
    assert.equal(classifyTutorPrompt('who are you?'), 'identity');
    assert.equal(classifyTutorPrompt('who are u?'), 'identity');
    assert.equal(classifyTutorPrompt('who r u'), 'identity');
    assert.equal(classifyTutorPrompt('what can you do?'), 'help');
    assert.equal(classifyTutorPrompt('what can u do?'), 'help');
    assert.equal(classifyTutorPrompt('como te uso?'), 'help');
    assert.equal(classifyTutorPrompt('what is the capital of France?'), 'external_knowledge');
    assert.equal(classifyTutorPrompt('explica el modulo 1'), 'course_documentary');
    assert.equal(classifyTutorPrompt('explain module 1'), 'course_documentary');
    assert.equal(classifyTutorPrompt('explica el módulo 1'), 'course_documentary');
    assert.equal(classifyTutorPrompt('eso'), 'ambiguous');
});

test('localiza respuestas sin contexto y bloquea conocimiento externo sin inventar', () => {
    const response = createInsufficientContextResponse('capital of France <test>', detectResponseLanguage('capital of France'));
    assert.match(response, /Information not available/);
    assert.match(response, /&lt;test&gt;/);
    assert.doesNotMatch(response, /Informacion no disponible/);
    assert.doesNotMatch(response, /Paris/i);

    const external = createExternalKnowledgeResponse('what is the capital of France?', detectResponseLanguage('what is the capital of France?'));
    assert.match(external, /Outside the available documentation/);
    assert.match(external, /web search/i);
    assert.doesNotMatch(external, /Paris/i);
});

test('responde smalltalk sin consultar embeddings ni Qdrant', async () => {
    const response = await getTutorResponse({
        curso: 'curso',
        vsIdQdrant: 'collection',
        prompt: 'how are u?'
    });

    assert.equal(response.webSearchUsed, false);
    assert.deepEqual(response.sources, []);
    assert.match(response.respuesta, /I'm here and ready/);
    assert.doesNotMatch(response.respuesta, /Informacion no disponible/);
});

test('responde identidad abreviada sin consultar embeddings ni Qdrant', async () => {
    const response = await getTutorResponse({
        curso: 'curso',
        vsIdQdrant: 'collection',
        prompt: 'who are u?'
    });

    assert.equal(response.webSearchUsed, false);
    assert.deepEqual(response.sources, []);
    assert.match(response.respuesta, /I am Kika/);
    assert.doesNotMatch(response.respuesta, /Information not available in the documentation/);
});

test('responde ayuda informal sin consultar embeddings ni Qdrant', async () => {
    const response = await getTutorResponse({
        curso: 'curso',
        vsIdQdrant: 'collection',
        prompt: 'como te uso?'
    });

    assert.equal(response.webSearchUsed, false);
    assert.deepEqual(response.sources, []);
    assert.match(response.respuesta, /Como puedo ayudar/);
    assert.doesNotMatch(response.respuesta, /Informacion no disponible/);
});

test('pide precision para referencias ambiguas sin consultar embeddings ni Qdrant', async () => {
    const response = await getTutorResponse({
        curso: 'curso',
        vsIdQdrant: 'collection',
        prompt: 'eso'
    });

    assert.equal(response.webSearchUsed, false);
    assert.deepEqual(response.sources, []);
    assert.match(response.respuesta, /Necesito mas precision/);
});

test('bloquea conocimiento externo sin busqueda web antes del RAG', async () => {
    const response = await getTutorResponse({
        curso: 'curso',
        vsIdQdrant: 'collection',
        prompt: 'what is the capital of France?'
    });

    assert.equal(response.webSearchUsed, false);
    assert.match(response.respuesta, /Outside the available documentation/);
    assert.doesNotMatch(response.respuesta, /Paris/i);
});

test('detecta preguntas estructurales del curso', () => {
    assert.equal(isStructuralQuestion('cuantos modulos tiene este curso'), true);
    assert.equal(isStructuralQuestion('lista los manuales cargados'), true);
    assert.equal(isStructuralQuestion('cuantas horas tiene el curso'), true);
    assert.equal(isStructuralQuestion('explica la memoria RAM'), false);
});

test('extrae modulos formativos y practicas sin mezclar MP como MF', () => {
    const catalog = extractTrainingCatalog([
        {
            fileName: 'IFCT0210_ficha.pdf',
            text: `Correspondencia con el Catalogo Modular de Formacion Profesional
                MF0219_2: Instalacion y configuracion de sistemas operativos (140 horas)
                UF0852: Instalacion y actualizacion de sistemas operativos (80 horas)
                UF0853: Explotacion de las funcionalidades del sistema microinformatico (60 horas)
                MF0957_2: Mantenimiento del subsistema fisico de sistemas informaticos (150 horas)
                UF1349: Mantenimiento e inventario del subsistema fisico (90 horas)
                UF1350: Monitorizacion y gestion de incidencias de los sistemas fisicos (60 horas)
                MF0958_2: Mantenimiento del subsistema logico de sistemas informaticos (150 horas)
                MF0959_2: Mantenimiento de la seguridad en sistemas informaticos (120 horas)
                MP0286: Modulo de practicas profesionales no laborales (40 horas)
                Duracion horas totales certificado de profesionalidad 600`
        },
        {
            fileName: 'manual-mf0958.pdf',
            text: 'MODULO FORMATIVO: MANTENIMIENTO DEL SUBSISTEMA LOGICO DE SISTEMAS INFORMATICOS Codigo: MF0958_2 Horas: 150'
        }
    ]);

    assert.deepEqual(catalog.modules.map(module => module.code), [
        'MF0219_2',
        'MF0957_2',
        'MF0958_2',
        'MF0959_2'
    ]);
    assert.deepEqual(catalog.practices.map(practice => practice.code), ['MP0286']);
    assert.equal(catalog.modules.length, 4);
    assert.equal(catalog.practices.length, 1);
    assert.equal(catalog.totalHours, 600);
});

test('construye contexto estructural como fuente preferente de coleccion', () => {
    const context = buildStructuralContext({
        files: [
            { fileName: 'IFCT0210_ficha.pdf', chunks: 4 },
            { fileName: 'manual-mf0958.pdf', chunks: 10 }
        ],
        catalog: {
            totalHours: 600,
            modules: [
                { code: 'MF0219_2', title: 'Instalacion y configuracion de sistemas operativos', hours: 140 },
                { code: 'MF0957_2', title: 'Mantenimiento del subsistema fisico de sistemas informaticos', hours: 150 },
                { code: 'MF0958_2', title: 'Mantenimiento del subsistema logico de sistemas informaticos', hours: 150 },
                { code: 'MF0959_2', title: 'Mantenimiento de la seguridad en sistemas informaticos', hours: 120 }
            ],
            units: [],
            practices: [
                { code: 'MP0286', title: 'Modulo de practicas profesionales no laborales', hours: 40 }
            ]
        }
    });

    assert.match(context, /ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION/);
    assert.match(context, /Modulos formativos oficiales detectados: 4/);
    assert.match(context, /MF0219_2/);
    assert.match(context, /MF0959_2/);
    assert.match(context, /MP0286/);
    assert.match(context, /separado de los modulos formativos/);
});

test('construye resumen minimo de coleccion para cualquier consulta documental', () => {
    const context = buildCollectionSummaryContext({
        files: [
            { fileName: 'ficha.pdf', chunks: 2 },
            { fileName: 'manual.pdf', chunks: 10 }
        ],
        catalog: {
            modules: [
                { code: 'MF0001_2', title: 'Modulo de prueba' }
            ],
            practices: [
                { code: 'MP0001', title: 'Practicas de prueba' }
            ]
        }
    });

    assert.match(context, /MEMORIA DOCUMENTAL DE LA COLECCION QDRANT/);
    assert.match(context, /ficha.pdf/);
    assert.match(context, /MF0001_2/);
    assert.match(context, /historial solo ayuda/);
});

test('evalua suficiencia documental sin contar solo el resumen de coleccion', () => {
    assert.equal(hasSufficientDocumentContext({
        structuralQuestion: false,
        structuralContext: '',
        explicitPages: [],
        lexicalChunks: [],
        searchResult: []
    }), false);

    assert.equal(hasSufficientDocumentContext({
        explicitPages: [{ text: 'contenido exacto de pagina' }]
    }), true);

    assert.equal(hasSufficientDocumentContext({
        lexicalChunks: [{ text: 'contenido encontrado por termino', matchedTerms: 2, termCount: 3 }]
    }), true);

    assert.equal(hasSufficientDocumentContext({
        lexicalChunks: [{ text: 'coincidencia parcial', matchedTerms: 1, termCount: 2 }],
        searchResult: []
    }), false);

    assert.equal(hasSufficientDocumentContext({
        searchResult: [{ score: 0.7, payload: { text: 'x'.repeat(600) } }]
    }), true);
});

test('detecta preguntas ambiguas sin evidencia documental recuperada', () => {
    assert.equal(isAmbiguousDocumentQuestion({
        prompt: 'eso',
        explicitPages: [],
        lexicalChunks: [],
        structuralQuestion: false
    }), true);

    assert.equal(isAmbiguousDocumentQuestion({
        prompt: 'eso',
        explicitPages: [{ text: 'pagina' }],
        lexicalChunks: [],
        structuralQuestion: false
    }), false);
});

test('genera respuesta segura cuando no hay contexto suficiente', () => {
    const response = createInsufficientContextResponse('capital de Francia <test>');

    assert.match(response, /Informacion no disponible/);
    assert.match(response, /capital de Francia/);
    assert.match(response, /&lt;test&gt;/);
    assert.doesNotMatch(response, /Paris/i);
});
