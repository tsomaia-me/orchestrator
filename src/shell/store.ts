/**
 * SHELL: Store Adapter
 * Handles FS persistence of RelayState.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import lockfile from 'proper-lockfile';
import { RelayState, INITIAL_STATE } from '../core/state';
import { LockManager } from './lock';
import { ExchangeManager } from './exchange';

export type ExchangeWriter = (newState: RelayState) => Promise<void>;
export type SideEffectFn = (newState: RelayState) => Promise<void>;

export class Store {
    private rootDir: string;
    private statePath: string;
    private lock: LockManager;
    private exchange: ExchangeManager;

    constructor(rootDir: string, exchange?: ExchangeManager) {
        this.rootDir = rootDir;
        this.statePath = path.join(rootDir, '.relay', 'state.json');
        this.lock = new LockManager(path.join(rootDir, '.relay'));
        this.exchange = exchange ?? new ExchangeManager(rootDir);
    }

    static async findRoot(startDir: string = process.cwd()): Promise<string | null> {
        let current = path.resolve(startDir);
        const root = path.parse(current).root;
        const home = os.homedir();

        while (current !== root && current !== home) {
            if (await fs.pathExists(path.join(current, '.relay'))) {
                return current;
            }
            current = path.dirname(current);
        }
        return null;
    }

    /**
     * V05: Lock init sentinel during creation — proper-lockfile requires file to exist.
     * We lock .relay/init.lock (created empty if missing) to serialize state.json creation.
     */
    async init(): Promise<void> {
        const relayDir = path.join(this.rootDir, '.relay');
        await fs.ensureDir(relayDir);
        const initLockPath = path.join(relayDir, 'init.lock');
        await fs.ensureFile(initLockPath);

        const release = await lockfile.lock(initLockPath, {
            stale: 60 * 1000,
            retries: { retries: 10, minTimeout: 100, maxTimeout: 500 },
        });
        try {
            if (!(await fs.pathExists(this.statePath))) {
                const tmpPath = this.statePath + '.tmp';
                await fs.writeJson(tmpPath, INITIAL_STATE, { spaces: 2 });
                await fs.move(tmpPath, this.statePath, { overwrite: true });
            }
            // Reconcile removed from init: state-exchange race fix. Purge runs only in updateWithExchange (holds state lock).
        } finally {
            await release();
        }
    }

    /** Audit 714ec505: Remove orphan .tmp from crashed write. Call only when holding state lock. */
    private async cleanupOrphanTmp(): Promise<void> {
        if (await fs.pathExists(this.statePath)) {
            const tmpPath = this.statePath + '.tmp';
            if (await fs.pathExists(tmpPath)) await fs.remove(tmpPath).catch(() => {});
        } else {
            const tmpPath = this.statePath + '.tmp';
            if (await fs.pathExists(tmpPath)) await fs.remove(tmpPath);
        }
    }

    /**
     * V-STAT-02: Remove orphan exchange files (zombies from failed state write after exchange).
     * Orphan = file for activeTaskId with iteration > state.iteration.
     * V-STATE-01: Also remove files for taskIds !== activeTaskId (aborted/replaced tasks).
     * Returns state for caller reuse (Audit 714ec505: eliminates double read).
     */
    private async reconcileOrphanExchanges(): Promise<RelayState> {
        const state = await this.read();
        if (!state.activeTaskId) return state;

        const exchangesDir = path.join(this.rootDir, '.relay', 'exchanges');
        await fs.ensureDir(exchangesDir);
        const files = await fs.readdir(exchangesDir);

        const pattern = /^(.+)-(\d{3})-(architect|engineer)-.+\.md$/;
        for (const name of files) {
            const m = name.match(pattern);
            if (!m) continue;
            const [, taskId, iterStr] = m;
            const iter = parseInt(iterStr, 10);
            const isOrphanIter = taskId === state.activeTaskId && iter > state.iteration;
            const isOrphanTask = taskId !== state.activeTaskId;
            if (isOrphanIter || isOrphanTask) {
                await fs.remove(path.join(exchangesDir, name)).catch((err: any) => {
                    console.error('[Relay] Reconcile: failed to remove orphan', name, err?.message ?? err);
                });
            }
        }
        return state;
    }

    /**
     * Atomic Update: Lock -> Read -> Update -> Write -> Unlock
     */
    async update(updater: (state: RelayState) => RelayState): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            await this.cleanupOrphanTmp();
            const state = await this.read();
            const newState = updater(state);
            // V03: Atomic write — write to .tmp then rename
            const tmpPath = this.statePath + '.tmp';
            await fs.writeJson(tmpPath, newState, { spaces: 2 });
            await fs.move(tmpPath, this.statePath, { overwrite: true });
            return newState;
        } finally {
            await release();
        }
    }

    /**
     * V03: Update + side effect within lock. V-02: Side-effect first, then state.
     * No rollback — if sideEffect fails we never touch state.
     */
    async updateWithSideEffect(
        updater: (state: RelayState) => RelayState,
        sideEffect: SideEffectFn
    ): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            await this.cleanupOrphanTmp();
            const state = await this.read();
            const newState = updater(state);
            await sideEffect(newState);
            const tmpPath = this.statePath + '.tmp';
            await fs.writeJson(tmpPath, newState, { spaces: 2 });
            await fs.move(tmpPath, this.statePath, { overwrite: true });
            return newState;
        } finally {
            await release();
        }
    }

    /**
     * V04/V06: Update + exchange write within lock. V01: Write exchange first, then state.
     * V-STAT-02: Exchange-first avoids rollback complexity. Tradeoff: if state write fails,
     * orphan "zombie" exchange may remain. reconcileOrphanExchanges() cleans these on next updateWithExchange.
     */
    async updateWithExchange(
        updater: (state: RelayState) => RelayState,
        exchangeWrite: ExchangeWriter
    ): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            await this.cleanupOrphanTmp();
            const state = await this.reconcileOrphanExchanges();
            const newState = updater(state);
            // V01: Exchange first — if it throws, state never changes; no rollback needed
            await exchangeWrite(newState);
            // Then state (tmp+rename) — no yield; keeps atomicity
            const tmpPath = this.statePath + '.tmp';
            await fs.writeJson(tmpPath, newState, { spaces: 2 });
            await fs.move(tmpPath, this.statePath, { overwrite: true });
            return newState;
        } finally {
            await release();
        }
    }

    /** Audit 714ec505: Pure read. No side effects. Call cleanupOrphanTmp() first when holding lock. */
    private async read(): Promise<RelayState> {
        if (await fs.pathExists(this.statePath)) {
            return await fs.readJson(this.statePath);
        }
        return INITIAL_STATE;
    }

    /**
     * Lock-protected read. Use for consistency-sensitive paths (e.g. context resource).
     * Remediation F4: Prevents read skew when a writer is mid-transaction.
     */
    async readLocked(): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            return await this.read();
        } finally {
            await release();
        }
    }

    /**
     * V06: Lock-held read of state + exchange content. Prevents read skew.
     */
    async readContext(): Promise<{ state: RelayState; lastExchangeContent: string | null }> {
        const release = await this.lock.acquire();
        try {
            const state = await this.read();
            const lastExchangeContent = await this.exchange.getLatestContent(state);
            return { state, lastExchangeContent };
        } finally {
            await release();
        }
    }

    getRootDir(): string {
        return this.rootDir;
    }
}
