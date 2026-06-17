import assert from 'node:assert/strict';
import test from 'node:test';

process.env.OPENAI_API_KEY ||= 'test-openai-api-key';
process.env.QDRANT_URL ||= 'http://localhost:6333';

const {
    chunkText,
    groupFilesFromPoints,
    normalizeUploadedFileName
} = await import('../src/service/qdrant-admin.service.js');

test('normaliza nombres de fichero subidos sin permitir rutas', () => {
    assert.equal(normalizeUploadedFileName('../manual raro!.pdf'), 'manual raro_.pdf');
    assert.equal(normalizeUploadedFileName(''), 'documento.txt');
});

test('divide texto en chunks con solape estable', () => {
    const chunks = chunkText('abcdefghij', { chunkSize: 4, overlap: 1 });

    assert.deepEqual(chunks, ['abcd', 'defg', 'ghij']);
});

test('agrupa ficheros desde puntos Qdrant legacy y nuevos', () => {
    const files = groupFilesFromPoints([
        { id: 1, payload: { file_name: 'b.pdf', file_id: 'file-b', uploaded_at: '2026-06-11T10:00:00.000Z' } },
        { id: 2, payload: { file_name: 'a.pdf' } },
        { id: 3, payload: { file_name: 'b.pdf', file_id: 'file-b' } }
    ]);

    assert.deepEqual(files.map(file => [file.file_name, file.chunks, file.file_id]), [
        ['a.pdf', 1, ''],
        ['b.pdf', 2, 'file-b']
    ]);
});
