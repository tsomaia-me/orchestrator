/**
 * SHELL: Lock Manager
 * Uses proper-lockfile for PID-based ownership and safe stale lock handling.
 * V02: Returns release function as closure to caller — one lock, one owner.
 * V-CONC-03: Lock mtime is refreshed every 5s (update option). Long-running blocking
 * work (sync I/O, CPU-bound) inside a lock scope is NOT supported — if the event loop
 * is blocked for 30+ seconds, the lock may be considered stale and another process
 * can acquire it.
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
        const retries = Math.max(1, Math.ceil(timeoutMs / 50));
        const baseMs = 50;

        for (let i = 0; i < retries; i++) {
            try {
                const releaseFn = await lockfile.lock(this.filePath, {
                    stale: 30 * 1000,
                    update: 5 * 1000,
                    retries: { retries: 0 },
                });
                return releaseFn;
            } catch (err: any) {
                if (err?.code === 'ENOENT') {
                    throw new Error(
                        'Relay is not initialized. Run from a project with .relay/ or ensure init has completed.'
                    );
                }
                if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }
                const delay = baseMs * Math.pow(2, i) + Math.random() * baseMs;
                await new Promise((r) => setTimeout(r, Math.min(delay, 2000)));
            }
        }
        throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
    }
}
