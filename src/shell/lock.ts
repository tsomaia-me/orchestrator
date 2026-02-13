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
        const baseMs = 50;

        for (let i = 0; ; i++) {
            try {
                const releaseFn = await lockfile.lock(this.filePath, {
                    stale: 30 * 1000,
                    update: 5 * 1000,
                    retries: { retries: 0 },
                });
                return releaseFn;
            } catch (err: any) {
                const elapsed = Date.now() - start;
                if (timeoutMs > 0 && elapsed >= timeoutMs) {
                    if (err?.code === 'ENOENT') {
                        throw new Error(
                            'Relay is not initialized. Run from a project with .relay/ or ensure init has completed.'
                        );
                    }
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }
                const remaining = timeoutMs - elapsed;
                if (remaining <= 0) {
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }
                // ENOENT: retry in case init() is creating state.json (waitable bootstrap)
                const delay = Math.min(
                    remaining,
                    baseMs * Math.pow(2, i) + Math.random() * baseMs,
                    2000
                );
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
}
