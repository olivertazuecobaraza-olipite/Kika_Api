import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.RUN_PROVIDER_SMOKE === 'true';

test('OpenAI responde con el modelo configurado', { skip: !enabled }, async () => {
    assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY es obligatoria para smoke');
    const { openai } = await import('../../src/config/openai.js');
    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-mini',
        messages: [{ role: 'user', content: 'Responde unicamente: OK' }],
        max_tokens: 5
    });
    assert.ok(response.choices?.[0]?.message?.content);
});

test('Perplexity responde y entrega contenido', {
    skip: !enabled || !process.env.PERPLEXITY_API_KEY
}, async () => {
    const { perplexity } = await import('../../src/config/perplexity.js');
    const response = await perplexity.chat.completions.create({
        model: process.env.PERPLEXITY_MODEL || 'sonar',
        messages: [{ role: 'user', content: 'Responde brevemente: 2+2' }],
        max_tokens: 20
    });
    assert.ok(response.choices?.[0]?.message?.content);
});
