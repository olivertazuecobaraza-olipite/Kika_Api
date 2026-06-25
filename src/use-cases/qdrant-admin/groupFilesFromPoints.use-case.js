export const groupFilesFromPoints = (points = []) => {
    const filesByName = new Map();
    points.forEach(point => {
        const payload = point.payload || {};
        const fileName = payload.file_name || 'sin_nombre';
        const existing = filesByName.get(fileName) || {
            file_id: payload.file_id || '',
            file_name: fileName,
            original_name: payload.file_name || fileName,
            mime_type: payload.mime_type || '',
            size: 0,
            chunks: 0,
            status: 'ready',
            uploaded_at: payload.uploaded_at || null,
            error: ''
        };
        existing.chunks += 1;
        if (!existing.file_id && payload.file_id) existing.file_id = payload.file_id;
        if (!existing.uploaded_at && payload.uploaded_at) existing.uploaded_at = payload.uploaded_at;
        filesByName.set(fileName, existing);
    });

    return [...filesByName.values()].sort((a, b) => a.file_name.localeCompare(b.file_name));
};
