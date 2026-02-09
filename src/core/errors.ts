import { RelayLogger } from './logger';

/**
 * Base error class for Relay with recovery hints
 */
export class RelayError extends Error {
    constructor(message: string, public recoveryHint?: string) {
        super(message);
        this.name = 'RelayError';
    }

    toString(): string {
        if (this.recoveryHint) {
            return `${this.message}\n💡 Hint: ${this.recoveryHint}`;
        }
        return this.message;
    }
}

/**
 * Validation error for malformed reports/directives
 */
export class ValidationError extends RelayError {
    constructor(message: string) {
        super(message, 'Check the file format matches the expected template.');
        this.name = 'ValidationError';
    }
}

/**
 * Lock error when another process is running
 */
export class LockError extends RelayError {
    constructor(message: string, public ownerPid?: number) {
        super(
            message,
            ownerPid
                ? `Another process (PID ${ownerPid}) is running. Wait or kill it.`
                : 'Try running: ./relay.sh reset'
        );
        this.name = 'LockError';
    }
}

/**
 * State error for corrupt or invalid state
 */
export class StateError extends RelayError {
    constructor(message: string) {
        super(message, 'Try running: ./relay.sh reset');
        this.name = 'StateError';
    }
}

/**
 * Log error with recovery hint
 */
export function logError(logger: RelayLogger, error: Error): void {
    if (error instanceof RelayError) {
        logger.error(`[ERROR] ${error.message}`);
        if (error.recoveryHint) {
            logger.info(`💡 Hint: ${error.recoveryHint}`);
        }
    } else {
        logger.error(`[ERROR] ${error.message}`);
    }
}
