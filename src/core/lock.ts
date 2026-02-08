import fs from 'fs-extra';
import path from 'path';

const LOCK_FILE = '.relay/lock';
const STALE_THRESHOLD_MS = 10000; // 10 seconds

export class LockManager {
    private lockPath: string;

    constructor(workDir: string) {
        this.lockPath = path.join(workDir, LOCK_FILE);
    }

    /**
     * Acquires the lock. Throws if locked.
     * Handles stale locks (older than 10s).
     */
    async acquire(): Promise<void> {
        await fs.ensureDir(path.dirname(this.lockPath));

        try {
            // Check if lock exists
            if (await fs.pathExists(this.lockPath)) {
                const stats = await fs.stat(this.lockPath);
                const age = Date.now() - stats.mtimeMs;

                if (age > STALE_THRESHOLD_MS) {
                    // Break stale lock
                    await fs.unlink(this.lockPath);
                } else {
                    throw new Error(`Relay is locked. Another process is running. (Lock age: ${age}ms)`);
                }
            }

            // Write 'LOCKED' to file
            await fs.writeFile(this.lockPath, 'LOCKED', { flag: 'wx' });
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                throw new Error('Relay is locked. Race condition detected.');
            }
            throw error;
        }
    }

    /**
     * Releases the lock.
     */
    async release(): Promise<void> {
        try {
            if (await fs.pathExists(this.lockPath)) {
                await fs.unlink(this.lockPath);
            }
        } catch (error) {
            // Ignore errors on release (e.g. if already missing)
        }
    }
}
