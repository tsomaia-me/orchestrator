import fs from 'fs-extra';
import path from 'path';

const STATE_FILE = 'state.json';

export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'done';

export interface RelayState {
    // Task tracking
    taskStatus: TaskStatus;
    currentTask?: {
        id: string;
        description: string;
        status: TaskStatus;
    };

    // Pipeline state (Pulse Protocol)
    stepIndex: number;
    loopIndex?: number;
    inLoop?: boolean;
    hasRunSystemPrompt: boolean;

    // Coordination tracking
    lastDirectiveHash?: string;
    lastReportHash?: string;
    lastDirective?: string;
    lastReport?: string;

    // Metadata
    iteration: number;
    lastUpdate: number;

    // Safety limits
    maxLoopIterations?: number;
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

    async reset(): Promise<void> {
        const relayDir = path.dirname(this.statePath);
        if (await fs.pathExists(relayDir)) {
            await fs.remove(relayDir);
        }
    }

    private defaultState(): RelayState {
        return {
            taskStatus: 'pending',
            stepIndex: 0,
            hasRunSystemPrompt: false,
            iteration: 0,
            lastUpdate: Date.now(),
        };
    }
}

