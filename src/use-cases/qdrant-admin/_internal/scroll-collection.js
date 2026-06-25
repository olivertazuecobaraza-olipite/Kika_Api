import { qdrant } from '../../../config/qdrant.js';
const MAX_SCROLL_POINTS = Number(process.env.QDRANT_MAX_SCROLL_POINTS || 5000);

export const scrollCollection = async (collectionName, { filter, limit = 100, maxPoints = MAX_SCROLL_POINTS } = {}) => {
    let offset = undefined;
    const points = [];
    do {
        const response = await qdrant.scroll(collectionName, {
            limit,
            with_payload: true,
            with_vector: false,
            filter,
            offset
        });
        points.push(...(response.points || []));
        offset = response.next_page_offset;
        if (points.length >= maxPoints) break;
    } while (offset);

    return points;
};
