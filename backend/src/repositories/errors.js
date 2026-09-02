class RepositoryConflictError extends Error {
    constructor(message, code = 'REPOSITORY_CONFLICT', details = undefined) {
        super(message);
        this.name = 'RepositoryConflictError';
        this.status = 409;
        this.code = code;
        if (details !== undefined) this.details = details;
    }
}

class VersionConflictError extends RepositoryConflictError {
    constructor(entity, id, expectedVersion, actualVersion = undefined) {
        super(
            `${entity} ${id} è stato modificato da un'altra operazione.`,
            'VERSION_CONFLICT',
            {
                entity,
                id: String(id),
                expectedVersion,
                actualVersion
            }
        );
        this.name = 'VersionConflictError';
    }
}

class ReferenceIntegrityError extends RepositoryConflictError {
    constructor(message, details = undefined) {
        super(message, 'REFERENCE_INTEGRITY_CONFLICT', details);
        this.name = 'ReferenceIntegrityError';
    }
}

class MediaMutationConflictError extends RepositoryConflictError {
    constructor(id, operation = undefined, expiresAt = undefined) {
        super(
            `È già in corso un'operazione sui file della foto ${id}.`,
            'PHOTO_MUTATION_IN_PROGRESS',
            {
                entity: 'photo',
                id: String(id),
                operation,
                expiresAt
            }
        );
        this.name = 'MediaMutationConflictError';
    }
}

module.exports = {
    MediaMutationConflictError,
    ReferenceIntegrityError,
    RepositoryConflictError,
    VersionConflictError
};
