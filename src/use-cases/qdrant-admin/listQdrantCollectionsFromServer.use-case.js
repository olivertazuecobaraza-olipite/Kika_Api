import { qdrant } from '../../config/qdrant.js';

export const listQdrantCollectionsFromServer = async () => {
    const response = await qdrant.getCollections();
    return response.collections || [];
};
