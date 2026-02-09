import fs from 'fs-extra';
import path from 'path';

export class LockManager {
    private lockPath: string;
    private lockId: string;
    private hasLock: boolean = false;

    constructor(dir: string, lockName: string = 'relay.lock') {
        this.lockPath = path.join(dir, lockName);
        // Unique ID for this process instance to verify ownership
        this.lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Acquire the lock. Throws if already locked.
     * @param timeoutMs Max time to wait for lock (default 0 = fail immediately)
     */
    async acquire(timeoutMs: number = 0): Promise<void> {
        const start = Date.now();

        while (true) {
            try {
                // Exclusive creation flag (wx) fails if file exists
                await fs.writeFile(this.lockPath, this.lockId, { flag: 'wx' });
                this.hasLock = true;
                return;
            } catch (e: any) {
                if (e.code !== 'EEXIST') {
                    throw e; // Unexpected error
                }

                // Check if stale? (Simple version: just check age)
                // For government reliability, we avoid auto-breaking locks unless specific override used.

                if (Date.now() - start >= timeoutMs) {
                    throw new Error(`Could not acquire lock at ${this.lockPath}. Another process is running.`);
                }

                // Wait and retry
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    /**
     * Release the lock. Only if we own it.
     */
    async release(): Promise<void> {
        if (!this.hasLock) return;

        try {
            const currentId = await fs.readFile(this.lockPath, 'utf-8');
            if (currentId === this.lockId) {
                await fs.remove(this.lockPath);
            }
        } catch (e) {
            // Ignore if file already gone
        } finally {
            this.hasLock = false;
        }
    }
}
