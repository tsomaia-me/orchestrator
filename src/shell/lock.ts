/**
 * SHELL: Lock Manager
 * Uses proper-lockfile for PID-based ownership and safe stale lock handling.
 * V02: Returns release function as closure to caller — one lock, one owner.
 * No instance-state dependency; prevents concurrent acquire from overwriting releaseFn.
 */

import lockfile from 'proper-lockfile';
import fs from 'fs-extra';
import path from 'path';

export type ReleaseFn = () => Promise<void>;

export class LockManager {
    private filePath: string;

    constructor(targetDir: string) {
        this.filePath = path.join(targetDir, 'state.json');
    }

    /**
     * Acquire lock with retries. Returns release function as closure.
     * Caller must call release() in finally block.
     */
    async acquire(timeoutMs = 5000): Promise<ReleaseFn> {
        await fs.ensureDir(path.dirname(this.filePath));
        // proper-lockfile requires the file to exist. Store.init() creates state.json before first use.

        const start = Date.now();
        const retries = Math.max(1, Math.ceil(timeoutMs / 100));
        const retryInterval = Math.min(100, timeoutMs / 10);

        for (let i = 0; i < retries; i++) {
            try {
                const releaseFn = await lockfile.lock(this.filePath, {
                    stale: 60 * 60 * 1000,
                    retries: { retries: 0 },
                });
                return releaseFn;
            } catch (err) {
                if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }
                await new Promise((r) => setTimeout(r, retryInterval));
            }
        }
        throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
    }
}
