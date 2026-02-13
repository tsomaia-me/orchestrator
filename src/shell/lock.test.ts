/**
 * SHELL: Lock Manager Tests
 * Audit 714ec505: Normal flow, fail-fast on fatal errors, retry behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { LockManager } from './lock';

describe('LockManager', () => {
    it('should acquire and release lock on existing state.json', async () => {
        const tmpDir = path.join(os.tmpdir(), `relay-lock-test-${Date.now()}`);
        await fs.ensureDir(tmpDir);
        await fs.writeJson(path.join(tmpDir, 'state.json'), { status: 'idle' });
        const lock = new LockManager(tmpDir);

        const release = await lock.acquire(1000);
        assert.ok(typeof release === 'function');

        await release();
        const release2 = await lock.acquire(1000);
        await release2();

        await fs.remove(tmpDir).catch(() => {});
    });

    it('should fail fast on EACCES (unrecoverable)', async function () {
        if (process.platform === 'win32') {
            this.skip();
        }
        const tmpDir = path.join(os.tmpdir(), `relay-lock-eacces-${Date.now()}`);
        await fs.ensureDir(tmpDir);
        const relayDir = path.join(tmpDir, '.relay');
        await fs.ensureDir(relayDir);
        await fs.writeJson(path.join(relayDir, 'state.json'), {});

        try {
            await fs.chmod(relayDir, 0o000);
            const lock = new LockManager(relayDir);
            await assert.rejects(
                () => lock.acquire(500),
                /Cannot acquire lock: EACCES/
            );
        } finally {
            await fs.chmod(relayDir, 0o755).catch(() => {});
            await fs.remove(tmpDir).catch(() => {});
        }
    });

    it('should throw ENOENT message after timeout when state.json missing', async () => {
        const tmpDir = path.join(os.tmpdir(), `relay-lock-enoent-${Date.now()}`);
        await fs.ensureDir(tmpDir);
        const relayDir = path.join(tmpDir, '.relay');
        await fs.ensureDir(relayDir);
        // state.json does NOT exist
        const lock = new LockManager(relayDir);

        await assert.rejects(
            () => lock.acquire(100),
            /Relay is not initialized/
        );

        await fs.remove(tmpDir).catch(() => {});
    });
});
