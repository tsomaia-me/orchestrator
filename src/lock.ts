import fs from 'fs-extra';
import path from 'path';

export class LockManager {
  private lockPath: string;
  private hasLock = false;

  constructor(dir: string, lockName = 'relay.lock') {
    this.lockPath = path.join(dir, lockName);
  }

  async acquire(timeoutMs = 0): Promise<void> {
    const start = Date.now();
    while (true) {
      try {
        await fs.mkdir(this.lockPath);
        this.hasLock = true;
        return;
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;

        // Check for stale lock
        try {
          const stats = await fs.stat(this.lockPath);
          const age = Date.now() - stats.mtimeMs;
          if (age > 60 * 60 * 1000) { // 1 hour stale
            await fs.rmdir(this.lockPath);
            continue; // Retry immediately
          }
        } catch {
          // Lock might have been removed by another process, retry
          continue;
        }

        if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
          throw new Error(`Could not acquire lock. Another relay process is running.`);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  async release(): Promise<void> {
    if (!this.hasLock) return;
    try {
      await fs.rmdir(this.lockPath);
    } catch {
      /* ignore if already gone */
    } finally {
      this.hasLock = false;
    }
  }

  async breakLock(): Promise<void> {
    try {
      await fs.rmdir(this.lockPath);
    } catch {
      /* ignore */
    }
  }
}
