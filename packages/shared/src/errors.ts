export class MemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

export class NotFoundError extends MemoryError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class InvalidStateTransitionError extends MemoryError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`, 'INVALID_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

export class StoreError extends MemoryError {
  constructor(
    message: string,
    public override readonly cause?: Error,
  ) {
    super(message, 'STORE_ERROR');
    this.name = 'StoreError';
  }
}

export class EmbeddingError extends MemoryError {
  constructor(message: string) {
    super(message, 'EMBEDDING_ERROR');
    this.name = 'EmbeddingError';
  }
}
