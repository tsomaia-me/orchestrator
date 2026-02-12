/**
 * CORE: Path Logic Tests
 * V01: Path traversal prevention via taskId whitelist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateTaskId, getExchangeFilename, getExchangePath } from './paths';

describe('validateTaskId (V01)', () => {
    it('accepts valid taskIds', () => {
        assert.doesNotThrow(() => validateTaskId('abc123'));
        assert.doesNotThrow(() => validateTaskId('task-001'));
        assert.doesNotThrow(() => validateTaskId('task_002'));
        assert.doesNotThrow(() => validateTaskId('a'));
    });

    it('rejects path traversal attempts', () => {
        assert.throws(() => validateTaskId('../../../etc/passwd'), /Invalid taskId/);
        assert.throws(() => validateTaskId('..'), /Invalid taskId/);
        assert.throws(() => validateTaskId('a/b'), /Invalid taskId/);
        assert.throws(() => validateTaskId('a\\b'), /Invalid taskId/);
    });

    it('rejects invalid characters', () => {
        assert.throws(() => validateTaskId('task@1'), /Invalid taskId/);
        assert.throws(() => validateTaskId('task 1'), /Invalid taskId/);
    });

    it('rejects taskId exceeding max length (V-03)', () => {
        assert.throws(() => validateTaskId('a'.repeat(70)), /length exceeds 64/);
        assert.doesNotThrow(() => validateTaskId('a'.repeat(64)));
    });
});

describe('getExchangeFilename (V01)', () => {
    it('validates taskId before building filename', () => {
        assert.throws(
            () => getExchangeFilename('bad..id', 'Title', 1, 'architect'),
            /Invalid taskId/
        );
    });
});

describe('getExchangeFilename (V04)', () => {
    it('truncates slug to keep filename under 255 chars', () => {
        const longTitle = 'a'.repeat(400);
        const filename = getExchangeFilename('abc-123-def', longTitle, 1, 'architect');
        assert.ok(filename.length <= 255, `filename length ${filename.length} exceeds 255`);
    });
});

describe('getExchangePath (V-PATH-01)', () => {
    it('throws when full path exceeds platform max', () => {
        // Create root that yields full path > MAX_PATH_LEN (259 Windows, 4095 Unix)
        const pad = process.platform === 'win32' ? 200 : 4100;
        const longRoot = '/x/' + 'a'.repeat(pad);
        assert.throws(
            () => getExchangePath(longRoot, 'task-1', 'Title', 1, 'architect'),
            /exceeds maximum length/
        );
    });
});
