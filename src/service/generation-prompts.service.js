const optionalLine = (label, value) => {
    const normalized = String(value || '').trim();
    return normalized ? `${label}: ${normalized}` : '';
};

const buildBaseInstructions = () => [
    'Responde exclusivamente con HTML valido, sin Markdown.',
    'Usa solo fragmentos semanticos como <section>, <h2>, <h3>, <p>, <ul>, <ol> y <li>.',
    'No incluyas <html>, <head>, <body>, estilos inline, scripts ni bloques de codigo.',
    'Estructura la respuesta para que se pueda insertar directamente en el chat del frontend.',
    'Basate en la documentacion recuperada de Qdrant. Si no hay contexto suficiente, devuelve un bloque HTML claro indicando que falta informacion documental.'
].join('\n');

export const buildSummaryPrompt = ({
    tema,
    extension,
    formato,
    enfoque,
    indicaciones_adicionales: indicacionesAdicionales = ''
}) => [
    buildBaseInstructions(),
    '',
    'Tarea: crea un resumen pedagogico.',
    `Tema del resumen: ${tema}`,
    `Extension: ${extension}`,
    `Formato: ${formato}`,
    `Enfoque: ${enfoque}`,
    optionalLine('Indicaciones adicionales', indicacionesAdicionales),
    '',
    'Estructura obligatoria:',
    '- Un <section> principal.',
    '- Un <h2> con el titulo del resumen.',
    '- Un bloque inicial breve que identifique el tema.',
    '- El contenido adaptado al formato solicitado.',
    '- Un cierre con ideas clave o puntos de repaso cuando encaje con el enfoque.'
].filter(Boolean).join('\n');

export const buildExamPrompt = ({
    tema,
    tipo,
    numero_preguntas_test: numeroPreguntasTest = 0,
    numero_preguntas_abiertas: numeroPreguntasAbiertas = 0,
    nivel_dificultad: nivelDificultad,
    indicaciones_adicionales: indicacionesAdicionales = ''
}) => [
    buildBaseInstructions(),
    '',
    'Tarea: crea un examen para evaluar al alumno.',
    `Tema del examen: ${tema}`,
    `Tipo de examen: ${tipo}`,
    `Numero de preguntas tipo test: ${numeroPreguntasTest || 0}`,
    `Numero de preguntas abiertas: ${numeroPreguntasAbiertas || 0}`,
    `Nivel de dificultad: ${nivelDificultad}`,
    optionalLine('Indicaciones adicionales', indicacionesAdicionales),
    '',
    'Estructura obligatoria:',
    '- Un <section> principal.',
    '- Un <h2> con el titulo del examen.',
    '- Un bloque de instrucciones para el alumno.',
    '- Preguntas tipo test con opciones A, B, C y D cuando aplique.',
    '- Preguntas abiertas cuando aplique.',
    '- No incluyas soluciones por defecto. Solo incluyelas si las indicaciones adicionales lo piden expresamente.'
].filter(Boolean).join('\n');

export const buildExercisePrompt = ({
    tema,
    tipo,
    nivel_dificultad: nivelDificultad,
    apartados,
    incluir_solucion: incluirSolucion,
    indicaciones_adicionales: indicacionesAdicionales = ''
}) => [
    buildBaseInstructions(),
    '',
    'Tarea: crea un ejercicio para que el alumno practique.',
    `Tema del ejercicio: ${tema}`,
    `Tipo de ejercicio: ${tipo}`,
    `Nivel de dificultad: ${nivelDificultad}`,
    `Numero de apartados: ${apartados}`,
    `Incluir solucion: ${incluirSolucion ? 'si' : 'no'}`,
    optionalLine('Indicaciones adicionales', indicacionesAdicionales),
    '',
    'Estructura obligatoria:',
    '- Un <section> principal.',
    '- Un <h2> con el titulo del ejercicio.',
    '- Un objetivo claro.',
    '- Los apartados numerados solicitados.',
    '- Desarrollo guiado segun el tipo de ejercicio.',
    incluirSolucion
        ? '- Incluye una seccion final de solucion o propuesta de respuesta.'
        : '- No incluyas solucion ni propuesta de respuesta.'
].filter(Boolean).join('\n');

export const buildGenerationPrompt = (type, payload) => {
    if (type === 'resumen') return buildSummaryPrompt(payload);
    if (type === 'examen') return buildExamPrompt(payload);
    if (type === 'ejercicio') return buildExercisePrompt(payload);
    throw new Error(`Tipo de generacion no soportado: ${type}`);
};
