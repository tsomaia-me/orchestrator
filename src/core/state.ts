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

        const backupPath = `${this.statePath}.bak`;

        // If main state missing, check backup
        if (!await fs.pathExists(this.statePath)) {
            if (await fs.pathExists(backupPath)) {
                console.warn('⚠️  Missing state.json. Restoring from backup...');
                await fs.copy(backupPath, this.statePath);
            } else {
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
        }

        try {
            const fileContent = await fs.readJson(this.statePath);
            return { ...defaults, ...fileContent };
        } catch (error: any) {
            console.error(`💥 State file corrupted: ${error.message}`);

            if (await fs.pathExists(backupPath)) {
                console.warn('⚠️  Attempting restore from backup...');
                try {
                    const backup = await fs.readJson(backupPath);
                    await fs.copy(backupPath, this.statePath); // Restore to main
                    return { ...defaults, ...backup };
                } catch (e) {
                    throw new Error('CRITICAL: State and Backup both corrupted. Manual intervention required.');
                }
            }
            throw new Error('CRITICAL: State corrupted and no backup available.');
        }
    }

    async save(state: RelayState): Promise<void> {
        const tempPath = `${this.statePath}.tmp`;
        const backupPath = `${this.statePath}.bak`;

        await fs.ensureDir(path.dirname(this.statePath));
        state.updatedAt = Date.now();

        // 1. Write to temp file (Atomic prep)
        await fs.writeJson(tempPath, state, { spaces: 2 });

        // 2. Create backup of current state if exists
        if (await fs.pathExists(this.statePath)) {
            await fs.copy(this.statePath, backupPath, { overwrite: true });
        }

        // 3. Rename temp to main (Atomic commit)
        await fs.rename(tempPath, this.statePath);
    }

    async reset(): Promise<void> {
        try {
            const state = await this.load();
            state.stepIndex = 0;
            state.loopIndex = 0;
            state.inLoop = false;
            // Also reset task runtime status?
            state.taskStatus = 'pending';
            await this.save(state);
        } catch (e) {
            // If load fails, we can't reset. Ignored.
        }
    }
}

