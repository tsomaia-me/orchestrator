/**
 * SHELL: Lock Manager
 * Handles file-based locking to prevent race conditions.
 */

import fs from 'fs-extra';
import path from 'path';

export class LockManager {
    private lockPath: string;
    private hasLock = false;

    constructor(targetDir: string) {
        this.lockPath = path.join(targetDir, 'relay.lock');
    }

    /**
     * Acquire lock with retries.
     * Uses atomic `mkdir` operation.
     * Handles stale locks (older than 1 hour).
     */
    async acquire(timeoutMs = 5000): Promise<void> {
        const start = Date.now();

        while (true) {
            try {
                await fs.mkdir(this.lockPath);
                this.hasLock = true;
                return;
            } catch (error: unknown) {
                const e = error as { code?: string };
                if (e.code !== 'EEXIST') throw error;

                // Check for stale lock
                try {
                    const stats = await fs.stat(this.lockPath);
                    const age = Date.now() - stats.mtimeMs;
                    if (age > 60 * 60 * 1000) { // 1 hour stale
                        // Attempt to break lock
                        await fs.rmdir(this.lockPath);
                        continue; // Retry immediately
                    }
                } catch {
                    // Lock might have been removed by another process, retry
                    continue;
                }

                if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
                    throw new Error(`Could not acquire lock after ${timeoutMs}ms. Relay is busy.`);
                }

                // Exponential Backoff
                const elapsed = Date.now() - start;
                const delay = Math.min(1000, 50 * Math.pow(1.5, Math.floor(elapsed / 100)));
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }

    async release(): Promise<void> {
        if (!this.hasLock) return;
        try {
            await fs.rmdir(this.lockPath);
            this.hasLock = false;
        } catch (e) {
            // Ignore if already removed
        }
    }
}
