const isRealHeading = (title, num) => {
    const titleLower = title.toLowerCase();
    if (/\bse\s+[a-z\u00f1\u00e1\u00e9\u00ed\u00f3\u00fa]+/i.test(titleLower)) return false;

    const actionVerbs = /^(?:define|definir|explica|explicar|compara|comparar|identifica|identificar|justifica|justificar|mide|medir|calcula|calcular|revisa|revisar|prepara|preparar|analiza|analizar|realiza|realizar|organiza|organizar|reubica|reubicar|imparte|impartir|escribe|escribir|elabora|elaborar|diferencia|diferenciar|relaciona|relacionar)\b/i;
    if (actionVerbs.test(titleLower)) return false;

    const words = title.split(/\s+/).filter(Boolean);
    const isSingleLevel = !num.includes('.');
    return !(isSingleLevel && words.length > 7);
};
const normalizeText = (value) => String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCatalogTitle = (value) => normalizeText(value)
    .replace(/^[\s:.\-–•●]+/, '')
    .replace(/[\s:.\-–•●]+$/, '')
    .replace(/\s*\(\s*(\d+)\s*horas?\s*\)\s*$/i, '')
    .trim();

const titleCaseCatalogText = (value) => {
    const normalized = normalizeCatalogTitle(value);
    if (!normalized) return '';

    if (/[a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1]/.test(normalized)) {
        return normalized;
    }

    return normalized.toLocaleLowerCase('es-ES')
        .replace(/(^|[\s(/-])([a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1])/g, (_, prefix, letter) => (
            `${prefix}${letter.toLocaleUpperCase('es-ES')}`
        ));
};

const isLikelyReferenceFile = (fileName) => (
    /(?:ficha|programa|certificado|boe|anexo|ifct|comt|ssce|adgd|hotr|seag|eocb)/i.test(fileName || '')
);

const isLikelyBadCatalogTitle = (title) => {
    if (!title) return true;
    if (title.length < 8 || title.length > 160) return true;
    return /^(?:horas?|nivel|codigo|c[oó]digo|familia|[0-9]+)$/i.test(title);
};

const findTitleAroundCode = ({ text, code, prefixRegex, suffixRegex }) => {
    const codeIndex = text.indexOf(code);
    if (codeIndex === -1) return '';

    const before = text.slice(Math.max(0, codeIndex - 500), codeIndex);
    const after = text.slice(codeIndex + code.length, Math.min(text.length, codeIndex + 500));
    const prefixMatch = before.match(prefixRegex);
    if (prefixMatch) return titleCaseCatalogText(prefixMatch[prefixMatch.length - 1]);

    const suffixMatch = after.match(suffixRegex);
    if (suffixMatch) return titleCaseCatalogText(suffixMatch[1]);

    return '';
};

const createCatalogItem = ({ code, title = '', hours = null, sourceFile = '', sourceRank = 1, index = 0 }) => ({
    code,
    title: titleCaseCatalogText(title),
    hours: Number.isFinite(Number(hours)) ? Number(hours) : null,
    sourceFile,
    sourceRank,
    index
});

const preferCatalogItem = (current, candidate) => {
    if (!current) return candidate;

    const currentHasGoodTitle = !isLikelyBadCatalogTitle(current.title);
    const candidateHasGoodTitle = !isLikelyBadCatalogTitle(candidate.title);
    if (!currentHasGoodTitle && candidateHasGoodTitle) return { ...current, ...candidate };
    if (!current.hours && candidate.hours) return { ...current, ...candidate };
    if (candidate.sourceRank < current.sourceRank && candidateHasGoodTitle) return { ...current, ...candidate };

    return current;
};

const addCatalogItem = (map, candidate) => {
    if (!candidate?.code) return;
    map.set(candidate.code, preferCatalogItem(map.get(candidate.code), candidate));
};

export const extractTrainingCatalog = (chunks) => {
    const modulesByCode = new Map();
    const unitsByCode = new Map();
    const practicesByCode = new Map();
    let totalHours = null;

    chunks.forEach((chunk, chunkIndex) => {
        const text = normalizeText(chunk.text);
        if (!text) return;

        const sourceRank = isLikelyReferenceFile(chunk.fileName) ? 0 : 1;
        const moduleListRegex = /\b(MF\d{4}_\d)\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        let match;
        while ((match = moduleListRegex.exec(text)) !== null) {
            addCatalogItem(modulesByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const moduleBlockRegex = /(?:M[OÓ]DULO\s+(?:FORMATIVO|PROFESIONAL)\s*(?:\d+)?\s*)?(?:Denominaci[oó]n:\s*)?([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z0-9\u00c1\u00c9\u00cd\u00d3\u00da\u00d1a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ,()./"'-]{8,180}?)\.?\s*(?:C[oó]digo:\s*)\b(MF\d{4}_\d)\b(?:.*?(?:Duraci[oó]n|Horas):?\s*(\d{2,4})\s*horas?)?/gi;
        while ((match = moduleBlockRegex.exec(text)) !== null) {
            addCatalogItem(modulesByCode, createCatalogItem({
                code: match[2],
                title: match[1],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const moduleCodeRegex = /\b(MF\d{4}_\d)\b/g;
        while ((match = moduleCodeRegex.exec(text)) !== null) {
            const code = match[1];
            const existing = modulesByCode.get(code);
            if (existing && !isLikelyBadCatalogTitle(existing.title) && existing.hours) continue;

            const title = findTitleAroundCode({
                text,
                code,
                prefixRegex: /(?:M[OÓ]DULO\s+(?:FORMATIVO|PROFESIONAL)(?::|\s*[-–])?\s*|Denominaci[oó]n:\s*)([^.;\n\r]{8,180})$/i,
                suffixRegex: /^[:\s\-–]*(?:\([^)]+\)\s*)?([^.;●•\n\r]{8,180})/i
            });
            const after = text.slice(match.index, Math.min(text.length, match.index + 400));
            const hoursMatch = after.match(/(?:Duraci[oó]n|Horas):?\s*(\d{2,4})\s*horas?|\((\d{2,4})\s*horas?\)/i);

            addCatalogItem(modulesByCode, createCatalogItem({
                code,
                title,
                hours: hoursMatch?.[1] || hoursMatch?.[2],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const unitRegex = /\b(UF\d{4})\b\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        while ((match = unitRegex.exec(text)) !== null) {
            addCatalogItem(unitsByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const unitBlockRegex = /(?:UNIDAD\s+FORMATIVA\s*(?:\d+)?\s*)?(?:Denominaci[oó]n:\s*)?([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Z0-9\u00c1\u00c9\u00cd\u00d3\u00da\u00d1a-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ,()./"'-]{8,180}?)\.?\s*C[oó]digo:\s*\b(UF\d{4})\b(?:.*?Duraci[oó]n:?\s*(\d{2,4})\s*horas?)?/gi;
        while ((match = unitBlockRegex.exec(text)) !== null) {
            addCatalogItem(unitsByCode, createCatalogItem({
                code: match[2],
                title: match[1],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const practiceRegex = /\b(MP\d{4})\b\s*:?\s*([^.;●•\n\r]{8,180}?)\s*\(?(\d{2,4})\s*horas?\)?/gi;
        while ((match = practiceRegex.exec(text)) !== null) {
            addCatalogItem(practicesByCode, createCatalogItem({
                code: match[1],
                title: match[2],
                hours: match[3],
                sourceFile: chunk.fileName,
                sourceRank,
                index: chunkIndex
            }));
        }

        const totalMatch = text.match(/Duraci[oó]n\s+horas\s+totales\s+(?:certificado|curso|especialidad)[^0-9]{0,20}(\d{2,4})|Duraci[oó]n\s+de\s+la\s+formaci[oó]n\s+asociada:\s*(\d{2,4})\s*horas|Horas\s+totales:\s*(\d{2,4})/i);
        if (totalMatch) {
            totalHours = Number(totalMatch[1] || totalMatch[2] || totalMatch[3]);
        }
    });

    const byCatalogCode = (a, b) => a.code.localeCompare(b.code, 'es', { numeric: true });

    return {
        modules: [...modulesByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        units: [...unitsByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        practices: [...practicesByCode.values()].filter(item => !isLikelyBadCatalogTitle(item.title)).sort(byCatalogCode),
        totalHours
    };
};
