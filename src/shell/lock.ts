/**
 * SHELL: Lock Manager
 * Uses proper-lockfile for PID-based ownership and safe stale lock handling.
 * Remediation F1: Eliminates race condition in lock cleanup.
 */

import lockfile from 'proper-lockfile';
import fs from 'fs-extra';
import path from 'path';

export class LockManager {
    private filePath: string;
    private releaseFn: (() => Promise<void>) | null = null;

    constructor(targetDir: string) {
        this.filePath = path.join(targetDir, 'state.json');
    }

    /**
     * Acquire lock with retries.
     * Uses proper-lockfile: PID-based ownership, safe stale detection.
     */
    async acquire(timeoutMs = 5000): Promise<void> {
        await fs.ensureDir(path.dirname(this.filePath));
        // proper-lockfile requires the file to exist. Store.init() creates state.json before first use.

        const start = Date.now();
        const retries = Math.max(1, Math.ceil(timeoutMs / 100));
        const retryInterval = Math.min(100, timeoutMs / 10);

        for (let i = 0; i < retries; i++) {
            try {
                this.releaseFn = await lockfile.lock(this.filePath, {
                    stale: 60 * 60 * 1000,
                    retries: { retries: 0 },
                });
                return;
            } catch (err) {
                if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }
                await new Promise((r) => setTimeout(r, retryInterval));
            }
        }
        throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
    }

    async release(): Promise<void> {
        if (!this.releaseFn) return;
        try {
            await this.releaseFn();
        } catch {
            // Ignore
        }
        this.releaseFn = null;
    }
}
