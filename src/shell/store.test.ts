/**
 * SHELL: Store Tests
 * Audit 714ec505: read() purity, updateWithExchange efficiency, reconcile behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { Store } from './store';
import { INITIAL_STATE } from '../core/state';

describe('Store', () => {
    const tmpDir = path.join(os.tmpdir(), `relay-store-test-${Date.now()}`);

    it('readLocked does not delete .tmp (read purity)', async () => {
        const store = new Store(tmpDir);
        await store.init();

        const statePath = path.join(tmpDir, '.relay', 'state.json');
        const tmpPath = statePath + '.tmp';
        await fs.writeJson(tmpPath, { ...INITIAL_STATE, status: 'idle' });

        const state = await store.readLocked();
        assert.strictEqual(state.status, 'idle');

        const tmpStillExists = await fs.pathExists(tmpPath);
        assert.strictEqual(tmpStillExists, true, 'read() must not delete .tmp (CQS)');

        await fs.remove(tmpPath).catch(() => {});
        await fs.remove(tmpDir).catch(() => {});
    });

    it('updateWithExchange applies updater and returns new state', async () => {
        const root = path.join(os.tmpdir(), `relay-store-update-${Date.now()}`);
        const store = new Store(root);
        await store.init();

        const result = await store.updateWithExchange(
            (s) => ({
                ...s,
                status: 'planning',
                activeTaskId: 'task-1',
                activeTaskTitle: 'Test',
                iteration: 1,
                lastActionBy: 'architect',
                updatedAt: Date.now(),
            }),
            async () => {}
        );

        assert.strictEqual(result.status, 'planning');
        assert.strictEqual(result.activeTaskId, 'task-1');
        assert.strictEqual(result.iteration, 1);

        await fs.remove(root).catch(() => {});
    });

    it('updateWithExchange removes orphan exchanges (reconcile)', async () => {
        const root = path.join(os.tmpdir(), `relay-store-reconcile-${Date.now()}`);
        const store = new Store(root);
        await store.init();

        await store.updateWithExchange(
            (s) => ({
                ...s,
                status: 'planning',
                activeTaskId: 'task-a',
                activeTaskTitle: 'Task A',
                iteration: 1,
                lastActionBy: 'architect',
                updatedAt: Date.now(),
            }),
            async () => {}
        );

        const exchangesDir = path.join(root, '.relay', 'exchanges');
        await fs.ensureDir(exchangesDir);
        const orphanPath = path.join(exchangesDir, 'task-a-002-engineer-orphan.md');
        await fs.writeFile(orphanPath, 'orphan content');

        await store.updateWithExchange(
            (s) => ({ ...s, updatedAt: Date.now() }),
            async () => {}
        );

        const orphanExists = await fs.pathExists(orphanPath);
        assert.strictEqual(orphanExists, false, 'reconcile should remove iter > state.iteration');

        await fs.remove(root).catch(() => {});
    });
});
