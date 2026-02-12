import fs from 'fs-extra';
import path from 'path';

export class LockManager {
  private lockPath: string;
  private lockId: string;
  private hasLock = false;

  constructor(dir: string, lockName = 'relay.lock') {
    this.lockPath = path.join(dir, lockName);
    this.lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async acquire(timeoutMs = 0): Promise<void> {
    const start = Date.now();
    while (true) {
      try {
        await fs.writeFile(this.lockPath, this.lockId, { flag: 'wx' });
        this.hasLock = true;
        return;
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
        if (Date.now() - start >= timeoutMs) {
          throw new Error(`Could not acquire lock. Another process is running.`);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  async release(): Promise<void> {
    if (!this.hasLock) return;
    try {
      const current = await fs.readFile(this.lockPath, 'utf-8');
      if (current === this.lockId) await fs.remove(this.lockPath);
    } catch {
      /* ignore */
    } finally {
      this.hasLock = false;
    }
  }
}
