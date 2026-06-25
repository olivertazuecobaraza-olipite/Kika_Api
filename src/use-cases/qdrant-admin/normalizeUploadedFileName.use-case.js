import path from 'path';

export const normalizeUploadedFileName = (fileName) => {
    const baseName = path.basename(String(fileName || 'documento.txt'));
    return baseName.replace(/[^\w.\-() ]+/g, '_').replace(/\s+/g, ' ').trim() || `fichero-${Date.now()}`;
};
