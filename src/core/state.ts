import fs from 'fs-extra';
import path from 'path';
import { FeatureState } from './feature';

const STATE_FILE = 'state.json';

// Task status for runtime tracking (distinct from Feature status)
export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'done';

export interface RelayState extends FeatureState {
    // Runtime Pipeline state (not persisted in FeatureState usually, but RelayState persists everything in state.json)
    // Actually, state.json IS FeatureState. 
    // We append runtime fields to it?
    // Yes, we store everything in state.json.

    // Pipeline state (Pulse Protocol)
    stepIndex: number;
    loopIndex?: number;
    inLoop?: boolean;
    hasRunSystemPrompt: boolean;

    // Task specific runtime tracking
    taskStatus?: TaskStatus; // Optional, defaults to pending

    // Coordination tracking caches
    lastDirectiveHash?: string;
    lastReportHash?: string;
    lastDirective?: string;
    lastReport?: string;

    // Safety limits
    maxLoopIterations?: number;
}

export class StateManager {
    private statePath: string;

    constructor(workDir: string) {
        this.statePath = path.join(workDir, STATE_FILE);
    }

    async load(): Promise<RelayState> {
        // Default runtime state
        const defaults = {
            stepIndex: 0,
            hasRunSystemPrompt: false,
            taskStatus: 'pending' as TaskStatus
        };

        if (!await fs.pathExists(this.statePath)) {
            return {
                ...defaults,
                currentTask: '',
                currentTaskSlug: '',
                iteration: 0,
                lastAuthor: null,
                status: 'pending',
                createdAt: Date.now(),
                updatedAt: Date.now()
            } as RelayState;
        }

        try {
            const fileContent = await fs.readJson(this.statePath);
            return { ...defaults, ...fileContent };
        } catch (error) {
            throw new Error(`Failed to load state: ${error}`);
        }
    }

    async save(state: RelayState): Promise<void> {
        await fs.ensureDir(path.dirname(this.statePath));
        state.updatedAt = Date.now(); // Update FeatureState timestamp
        await fs.writeJson(this.statePath, state, { spaces: 2 });
    }

    async reset(): Promise<void> {
        // Be careful not to delete state.json if it contains Feature data!
        // Reset should probably just reset runtime fields?
        // But for "reset", we might mean "clear pipeline progress".
        const state = await this.load();
        state.stepIndex = 0;
        state.loopIndex = 0;
        state.inLoop = false;
        await this.save(state);
    }
}

