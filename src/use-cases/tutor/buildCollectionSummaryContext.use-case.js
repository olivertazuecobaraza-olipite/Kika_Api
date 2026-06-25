const COLLECTION_SUMMARY_CONTEXT_CHARS = Number(process.env.COLLECTION_SUMMARY_CONTEXT_CHARS || 1500);

export const buildCollectionSummaryContext = ({ files = [], catalog = {} } = {}) => {
    const lines = ['MEMORIA DOCUMENTAL DE LA COLECCION QDRANT'];

    if (files.length > 0) {
        lines.push(`Archivos disponibles: ${files.map(file => file.fileName).join(', ')}`);
    }

    if (catalog.modules?.length > 0) {
        lines.push(`Modulos formativos detectados: ${catalog.modules.map(module => `${module.code} ${module.title}`).join('; ')}`);
    }

    if (catalog.practices?.length > 0) {
        lines.push(`Practicas detectadas: ${catalog.practices.map(practice => `${practice.code} ${practice.title}`).join('; ')}`);
    }

    lines.push('Nota: este contexto documental sirve como apoyo preferente cuando sea relevante, pero no debe bloquear la conversacion si no contiene la respuesta exacta.');

    return lines.join('\n').slice(0, COLLECTION_SUMMARY_CONTEXT_CHARS);
};
