import assert from 'node:assert/strict';
import test from 'node:test';

process.env.OPENAI_API_KEY ||= 'test-openai-api-key';

const {
    buildUserGenerationMessage,
    generateConversationContent
} = await import('../src/service/content-generation.service.js');
const { normalizeAssistantHtml } = await import('../src/service/tutor.service.js');

const createMessageModel = ({ previousMessages = [] } = {}) => {
    const created = [];
    const model = {
        created,
        async create(data) {
            const message = {
                ...data,
                createdAt: data.role === 'user'
                    ? new Date('2026-01-01T10:00:00.000Z')
                    : new Date('2026-01-01T10:00:01.000Z')
            };
            created.push(message);
            return message;
        },
        find() {
            return {
                sort() {
                    return this;
                },
                limit() {
                    return this;
                },
                async lean() {
                    return previousMessages;
                }
            };
        }
    };
    return model;
};

test('construye mensaje de usuario legible para generacion', () => {
    assert.equal(
        buildUserGenerationMessage('resumen', { tema: 'Comunicacion' }),
        'Generar resumen: Comunicacion'
    );
});

test('normaliza HTML generado eliminando saltos entre etiquetas', () => {
    assert.equal(
        normalizeAssistantHtml('<section>\n\n<h2>T</h2>\n\n<p>A</p>\n</section>'),
        '<section><h2>T</h2><p>A</p></section>'
    );
    assert.equal(
        normalizeAssistantHtml('<section><h2>T</h2><p>A</p></section>'),
        '<section><h2>T</h2><p>A</p></section>'
    );
});

test('envuelve texto plano generado y lo escapa', () => {
    assert.equal(
        normalizeAssistantHtml('Respuesta simple'),
        '<section><p>Respuesta simple</p></section>'
    );
    assert.equal(
        normalizeAssistantHtml('2 < 3 & 4 > 1'),
        '<section><p>2 &lt; 3 &amp; 4 &gt; 1</p></section>'
    );
});

test('devuelve 404 si la conversacion no pertenece al usuario', async () => {
    const ConversationModel = {
        async findOne() {
            return null;
        }
    };

    await assert.rejects(
        generateConversationContent({
            userId: 'user_1',
            conversationId: '66583f4c2a0d4b98e1e0a111',
            type: 'resumen',
            payload: { tema: 'Tema' },
            deps: {
                ConversationModel,
                MessageModel: createMessageModel(),
                getTutorResponse: async () => ({ respuesta: '<section></section>', webSearchUsed: false, sources: [] })
            }
        }),
        error => error.status === 404 && error.name === 'ConversationNotFoundError'
    );
});

test('guarda mensajes, actualiza conversacion y devuelve respuesta comun', async () => {
    const updates = [];
    const conversation = {
        _id: '66583f4c2a0d4b98e1e0a111',
        userId: 'user_1',
        curso: 'COMT013PO',
        vsIdQdrant: 'vs_test',
        title: 'Nueva conversaciÃ³n'
    };
    const ConversationModel = {
        async findOne(filter) {
            assert.deepEqual(filter, { _id: conversation._id, userId: 'user_1' });
            return conversation;
        },
        async updateOne(filter, update) {
            updates.push({ filter, update });
        }
    };
    const MessageModel = createMessageModel({
        previousMessages: [{ role: 'assistant', content: '<p>Anterior</p>' }]
    });
    let tutorInput;

    const response = await generateConversationContent({
        userId: 'user_1',
        conversationId: conversation._id,
        type: 'ejercicio',
        payload: {
            tema: 'Caja',
            tipo: 'preguntas',
            nivel_dificultad: 'basico',
            apartados: 2,
            incluir_solucion: false
        },
        deps: {
            ConversationModel,
            MessageModel,
            getTutorResponse: async (input) => {
                tutorInput = input;
                return {
                    respuesta: '<section><h2>Ejercicio</h2><p>Practica guiada</p></section>',
                    webSearchUsed: false,
                    sources: []
                };
            }
        }
    });

    assert.equal(MessageModel.created.length, 2);
    assert.equal(MessageModel.created[0].role, 'user');
    assert.equal(MessageModel.created[0].content, 'Generar ejercicio: Caja');
    assert.equal(MessageModel.created[1].role, 'assistant');
    assert.equal(MessageModel.created[1].content, '<section><h2>Ejercicio</h2><p>Practica guiada</p></section>');
    assert.equal(tutorInput.curso, 'COMT013PO');
    assert.equal(tutorInput.vsIdQdrant, 'vs_test');
    assert.equal(tutorInput.webSearch, false);
    assert.match(tutorInput.prompt, /Tarea: crea un ejercicio/);
    assert.deepEqual(tutorInput.history, [{ role: 'assistant', content: '<p>Anterior</p>' }]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].update.$set.title, 'Ejercicio: Caja');
    assert.deepEqual(response, {
        conversation_id: conversation._id,
        tipo_generacion: 'ejercicio',
        respuesta: '<section><h2>Ejercicio</h2><p>Practica guiada</p></section>',
        web_search_used: false,
        fuentes: []
    });
});

test('permite web search solo si el controlador o llamada de resumen lo activa', async () => {
    const ConversationModel = {
        async findOne() {
            return {
                _id: '66583f4c2a0d4b98e1e0a111',
                curso: 'COMT013PO',
                vsIdQdrant: 'vs_test',
                title: 'Titulo existente'
            };
        },
        async updateOne() {}
    };
    const MessageModel = createMessageModel();
    let tutorInput;

    const response = await generateConversationContent({
        userId: 'user_1',
        conversationId: '66583f4c2a0d4b98e1e0a111',
        type: 'resumen',
        payload: {
            tema: 'Normativa reciente',
            extension: 'breve',
            formato: 'parrafos',
            enfoque: 'conceptos_principales'
        },
        webSearch: true,
        deps: {
            ConversationModel,
            MessageModel,
            getTutorResponse: async (input) => {
                tutorInput = input;
                return {
                    respuesta: '<section><h2>Resumen</h2></section>',
                    webSearchUsed: true,
                    sources: [{ titulo: 'Fuente', url: 'https://example.com', fecha: '' }]
                };
            }
        }
    });

    assert.equal(tutorInput.webSearch, true);
    assert.equal(response.web_search_used, true);
    assert.equal(response.fuentes.length, 1);
});
