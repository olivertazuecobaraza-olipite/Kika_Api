import { listQdrantCollectionsFromServer } from './listQdrantCollectionsFromServer.use-case.js';

export const collectionExistsInQdrant = async (collectionName) => {
    const collections = await listQdrantCollectionsFromServer();
    return collections.some(collection => collection.name === collectionName);
};
