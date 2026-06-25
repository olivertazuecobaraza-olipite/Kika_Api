const COLLECTION_STRUCTURAL_CONTEXT_CHARS = Number(process.env.COLLECTION_STRUCTURAL_CONTEXT_CHARS || 4000);

const formatHours = (hours) => hours ? ` (${hours} horas)` : '';

export const buildStructuralContext = ({ files = [], catalog = {} } = {}) => {
    const lines = ['ESTRUCTURA OFICIAL DETECTADA EN LA COLECCION'];

    if (files.length > 0) {
        lines.push('Archivos cargados:');
        files.forEach(file => {
            lines.push(`- ${file.fileName}: ${file.chunks} fragmentos`);
        });
    }

    if (catalog.totalHours) {
        lines.push(`Duracion total detectada: ${catalog.totalHours} horas`);
    }

    if (catalog.modules?.length > 0) {
        lines.push(`Modulos formativos oficiales detectados: ${catalog.modules.length}`);
        catalog.modules.forEach(module => {
            lines.push(`- ${module.code}: ${module.title}${formatHours(module.hours)}`);
        });
    } else {
        lines.push('Modulos formativos oficiales detectados: no se ha detectado un listado canonico de modulos formativos.');
    }

    if (catalog.units?.length > 0) {
        lines.push('Unidades formativas detectadas:');
        catalog.units.forEach(unit => {
            lines.push(`- ${unit.code}: ${unit.title}${formatHours(unit.hours)}`);
        });
    }

    if (catalog.practices?.length > 0) {
        lines.push('Modulo de practicas detectado, separado de los modulos formativos:');
        catalog.practices.forEach(practice => {
            lines.push(`- ${practice.code}: ${practice.title}${formatHours(practice.hours)}`);
        });
    }

    lines.push('Regla: para preguntas sobre numero/listado de modulos, unidades, manuales, horas o estructura del curso, usa este bloque como fuente preferente. No concluyas que solo existen los elementos presentes en fragmentos vectoriales parciales si este bloque contiene un listado mas completo.');

    return lines.join('\n').slice(0, COLLECTION_STRUCTURAL_CONTEXT_CHARS);
};
