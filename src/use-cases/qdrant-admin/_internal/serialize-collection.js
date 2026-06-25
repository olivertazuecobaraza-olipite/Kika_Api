export const serializeCollection = (collection) => ({
    collection_name: collection.collectionName,
    display_name: collection.displayName,
    course_id: collection.courseId,
    curso: collection.curso,
    status: collection.status,
    vector_size: collection.vectorSize,
    distance: collection.distance,
    files_count: collection.files?.filter(file => file.status !== 'deleted').length || 0,
    files: (collection.files || [])
        .filter(file => file.status !== 'deleted')
        .map(file => ({
            file_id: file.fileId,
            file_name: file.fileName,
            original_name: file.originalName,
            mime_type: file.mimeType,
            size: file.size,
            chunks: file.chunks,
            status: file.status,
            uploaded_at: file.uploadedAt,
            error: file.error
        })),
    created_at: collection.createdAt,
    updated_at: collection.updatedAt
});
