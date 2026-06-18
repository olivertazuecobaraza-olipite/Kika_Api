import assert from 'node:assert/strict';
import test from 'node:test';

const {
    buildExamPrompt,
    buildExercisePrompt,
    buildSummaryPrompt
} = await import('../src/service/generation-prompts.service.js');

test('genera prompt de resumen con parametros y reglas HTML', () => {
    const prompt = buildSummaryPrompt({
        tema: 'Prevencion de riesgos',
        extension: 'medio',
        formato: 'puntos_clave',
        enfoque: 'para_estudiar',
        indicaciones_adicionales: 'Incluye ejemplos'
    });

    assert.match(prompt, /Tema del resumen: Prevencion de riesgos/);
    assert.match(prompt, /Extension: medio/);
    assert.match(prompt, /Formato: puntos_clave/);
    assert.match(prompt, /Enfoque: para_estudiar/);
    assert.match(prompt, /HTML valido/);
    assert.match(prompt, /sin Markdown/);
    assert.match(prompt, /No incluyas <html>, <head>, <body>/);
});

test('genera prompt de examen mixto con contadores y sin soluciones por defecto', () => {
    const prompt = buildExamPrompt({
        tema: 'Caja y cobros',
        tipo: 'mixto',
        numero_preguntas_test: 5,
        numero_preguntas_abiertas: 2,
        nivel_dificultad: 'intermedio'
    });

    assert.match(prompt, /Tipo de examen: mixto/);
    assert.match(prompt, /Numero de preguntas tipo test: 5/);
    assert.match(prompt, /Numero de preguntas abiertas: 2/);
    assert.match(prompt, /Nivel de dificultad: intermedio/);
    assert.match(prompt, /No incluyas soluciones por defecto/);
});

test('genera prompt de ejercicio incluyendo o excluyendo solucion', () => {
    const withSolution = buildExercisePrompt({
        tema: 'Atencion al cliente',
        tipo: 'caso_aplicado',
        nivel_dificultad: 'basico',
        apartados: 3,
        incluir_solucion: true
    });
    const withoutSolution = buildExercisePrompt({
        tema: 'Atencion al cliente',
        tipo: 'caso_aplicado',
        nivel_dificultad: 'basico',
        apartados: 3,
        incluir_solucion: false
    });

    assert.match(withSolution, /Incluir solucion: si/);
    assert.match(withSolution, /Incluye una seccion final de solucion/);
    assert.match(withoutSolution, /Incluir solucion: no/);
    assert.match(withoutSolution, /No incluyas solucion ni propuesta de respuesta/);
});
