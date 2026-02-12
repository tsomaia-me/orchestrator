/**
 * SHELL: Store Adapter
 * Handles FS persistence of RelayState.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { RelayState, INITIAL_STATE } from '../core/state';
import { LockManager } from './lock';

export class Store {
    private rootDir: string;
    private statePath: string;
    private lock: LockManager;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
        this.statePath = path.join(rootDir, '.relay', 'state.json');
        this.lock = new LockManager(path.join(rootDir, '.relay'));
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

    async init(): Promise<void> {
        await fs.ensureDir(path.join(this.rootDir, '.relay'));
        if (!(await fs.pathExists(this.statePath))) {
            await fs.writeJson(this.statePath, INITIAL_STATE, { spaces: 2 });
        }
    }

    /**
     * Atomic Update: Lock -> Read -> Update -> Write -> Unlock
     */
    async update(updater: (state: RelayState) => RelayState): Promise<RelayState> {
        await this.lock.acquire();
        try {
            const state = await this.read();
            const newState = updater(state);
            await fs.writeJson(this.statePath, newState, { spaces: 2 });
            return newState;
        } finally {
            await this.lock.release();
        }
    }

    async read(): Promise<RelayState> {
        if (!(await fs.pathExists(this.statePath))) {
            return INITIAL_STATE;
        }
        return await fs.readJson(this.statePath);
    }

    getRootDir(): string {
        return this.rootDir;
    }
}
