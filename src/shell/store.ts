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
                await fs.rename(tmpPath, this.statePath);
            }
        } finally {
            await release();
        }
    }

    /**
     * Atomic Update: Lock -> Read -> Update -> Write -> Unlock
     */
    async update(updater: (state: RelayState) => RelayState): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            const state = await this.read();
            const newState = updater(state);
            // V03: Atomic write — write to .tmp then rename
            const tmpPath = this.statePath + '.tmp';
            await fs.writeJson(tmpPath, newState, { spaces: 2 });
            await fs.rename(tmpPath, this.statePath);
            return newState;
        } finally {
            await release();
        }
    }

    /**
     * V04/V06: Update + exchange write within lock. Rollback state on exchange failure.
     * Lock is never released until state and exchange I/O are confirmed.
     */
    async updateWithExchange(
        updater: (state: RelayState) => RelayState,
        exchangeWrite: ExchangeWriter
    ): Promise<RelayState> {
        const release = await this.lock.acquire();
        try {
            const state = await this.read();
            const newState = updater(state);
            const tmpPath = this.statePath + '.tmp';
            await fs.writeJson(tmpPath, newState, { spaces: 2 });
            await fs.rename(tmpPath, this.statePath);
            try {
                await exchangeWrite(newState);
            } catch (err) {
                await fs.writeJson(tmpPath, state, { spaces: 2 });
                await fs.rename(tmpPath, this.statePath);
                throw err;
            }
            return newState;
        } finally {
            await release();
        }
    }

    async read(): Promise<RelayState> {
        if (await fs.pathExists(this.statePath)) {
            return await fs.readJson(this.statePath);
        }
        // V03: Orphaned .tmp from crashed write — treat as failed, remove
        const tmpPath = this.statePath + '.tmp';
        if (await fs.pathExists(tmpPath)) {
            await fs.remove(tmpPath);
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
