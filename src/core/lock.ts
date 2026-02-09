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
     * Writes PID for debugging purposes.
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
                    const owner = await this.getOwner();
                    throw new Error(
                        `Relay is locked by PID ${owner || 'unknown'}. ` +
                        `Lock age: ${age}ms. Wait or run: ./relay.sh reset`
                    );
                }
            }

            // Write PID to file for debugging
            await fs.writeFile(this.lockPath, String(process.pid), { flag: 'wx' });
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                throw new Error('Relay is locked. Race condition detected. Try again.');
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

    /**
     * Get the PID of the process holding the lock.
     */
    async getOwner(): Promise<number | null> {
        try {
            if (!await fs.pathExists(this.lockPath)) {
                return null;
            }
            const content = await fs.readFile(this.lockPath, 'utf-8');
            const pid = parseInt(content.trim(), 10);
            return isNaN(pid) ? null : pid;
        } catch {
            return null;
        }
    }

    /**
     * Check if lock exists.
     */
    async isLocked(): Promise<boolean> {
        return fs.pathExists(this.lockPath);
    }
}

