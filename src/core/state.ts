import fs from 'fs-extra';
import path from 'path';

const STATE_FILE = 'state.json';

export interface RelayState {
    // Define structure of the persisted state
    task?: {
        id: string;
        description: string;
        status: 'pending' | 'in_progress' | 'review' | 'done';
    };
    iteration: number;
    lastUpdate: number;
}

export class StateManager {
    private statePath: string;

    constructor(workDir: string) {
        this.statePath = path.join(workDir, '.relay', STATE_FILE);
    }

    async load(): Promise<RelayState> {
        if (!await fs.pathExists(this.statePath)) {
            return this.defaultState();
        }
        try {
            return await fs.readJson(this.statePath);
        } catch (error) {
            // Corrupt state? Start fresh or throw? 
            // For robust systems, maybe backup and fresh start, but for now throw.
            throw new Error(`Failed to load state: ${error}`);
        }
    }

    async save(state: RelayState): Promise<void> {
        await fs.ensureDir(path.dirname(this.statePath));
        state.lastUpdate = Date.now();
        await fs.writeJson(this.statePath, state, { spaces: 2 });
    }

    private defaultState(): RelayState {
        return {
            iteration: 0,
            lastUpdate: Date.now(),
        };
    }
}
