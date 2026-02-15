import { RelayState, StatePersistence } from '../types'
import path from 'path'
import fs from 'fs/promises'
import { createEmptyState } from '../helpers'

export class FilePersistence implements StatePersistence {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async save(state: RelayState): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath, data, 'utf-8');
  }

  async load(): Promise<RelayState> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as RelayState;
    } catch (error) {
      return createEmptyState();
    }
  }
}
