import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../src/use-cases');

const getUseCaseFiles = async (area) => {
    const directory = path.join(ROOT, area);
    return (await readdir(directory))
        .filter(fileName => fileName.endsWith('.use-case.js'))
        .map(fileName => path.join(directory, fileName));
};

test('los use-cases de tutor y qdrant-admin contienen implementacion y no reexportan cores', async () => {
    const files = [
        ...await getUseCaseFiles('tutor'),
        ...await getUseCaseFiles('qdrant-admin')
    ];

    for (const file of files) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /from\s+['"].*\.core\.js['"]/, path.basename(file));
    }
});

test('los antiguos cores han sido eliminados', async () => {
    for (const core of [
        path.join(ROOT, 'tutor/tutor.core.js'),
        path.join(ROOT, 'qdrant-admin/qdrant-admin.core.js')
    ]) {
        await assert.rejects(access(core));
    }
});

