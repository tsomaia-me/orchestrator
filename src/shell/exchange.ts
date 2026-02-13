/**
 * SHELL: Exchange Manager
 * Handles reading/writing exchange files to disk.
 *
 * Expected layout: .relay/exchanges/{taskId}-{iter}-{author}-{slug}.md
 * Ordering (F5 remediation): state.json is persisted before exchange files.
 * Exchange writes are idempotent (overwrite by path).
 */

import fs from 'fs-extra';
import path from 'path';
import { getExchangePath } from '../core/paths';
import { RelayState } from '../core/state';

export class ExchangeManager {
    constructor(private rootDir: string) { }

    async init(): Promise<void> {
        await fs.ensureDir(path.join(this.rootDir, '.relay', 'exchanges'));
    }

    async writeExchange(
        taskId: string,
        taskTitle: string,
        iteration: number,
        author: 'architect' | 'engineer',
        content: string
    ): Promise<string> {
        const filePath = getExchangePath(this.rootDir, taskId, taskTitle, iteration, author);
        await fs.ensureDir(path.dirname(filePath));
        // V03/V-CONC-02: Atomic write — write to .tmp then move (fs.move overwrite for Windows)
        const tmpPath = filePath + '.tmp';
        await fs.writeFile(tmpPath, content, 'utf-8');
        await fs.move(tmpPath, filePath, { overwrite: true });
        return filePath;
    }

    /**
     * Find the path of the last exchange for this task.
     * Useful for reading context.
     */
    async getLatestContent(state: RelayState): Promise<string | null> {
        if (!state.activeTaskId || !state.activeTaskTitle) return null;

        // Logic: 
        // If waiting_for_engineer, we want the Architect's directive (lastActionBy = architect).
        // If waiting_for_architect, we want the Engineer's report (lastActionBy = engineer).
        // So we basically want the file corresponding to the current state.

        // If we are in 'planning', there is no exchange yet.
        if (state.status === 'planning') return null;

        const author = state.lastActionBy;
        if (!author) return null;

        // Iteration logic: 
        // In our reducer, we start at iteration 1.
        // When Architect submits, transition to waiting_for_engineer.
        // Iteration is 1. Author aka lastActionBy is architect.
        // So we read 1-architect.

        const filePath = getExchangePath(
            this.rootDir,
            state.activeTaskId,
            state.activeTaskTitle,
            state.iteration,
            author
        );

        // V06: State implies file should exist; throw if missing (manual deletion or corruption)
        if (!(await fs.pathExists(filePath))) {
            throw new Error(
                `Exchange file missing: ${path.basename(filePath)}. State suggests it should exist — possible manual deletion or corruption.`
            );
        }
        return await fs.readFile(filePath, 'utf-8');
    }

    /**
     * Retrieve the full history of exchanges for a task.
     * Used for context injection.
     */
    async getTaskHistory(taskId: string): Promise<import('../core/state').ExchangeEntry[]> {
        const exchangeDir = path.join(this.rootDir, '.relay', 'exchanges');
        if (!(await fs.pathExists(exchangeDir))) return [];

        const files = await fs.readdir(exchangeDir);
        const taskFiles = files.filter(f => f.startsWith(taskId));

        const history: import('../core/state').ExchangeEntry[] = [];

        for (const file of taskFiles) {
            try {
                // author is always 'architect' or 'engineer'
                // Format: {taskId}-{iter}-{author}-{slug}.md
                // Round 2: Strict regex to avoid ambiguity
                const match = file.match(/^([a-zA-Z0-9_-]+)-(\d{3})-(architect|engineer)-/);
                if (!match) continue;

                // const taskIdMatches = match[1] === taskId; // Implicit by filter
                const iteration = parseInt(match[2], 10);
                const author = match[3] as 'architect' | 'engineer';

                const content = await fs.readFile(path.join(exchangeDir, file), 'utf-8');
                const stat = await fs.stat(path.join(exchangeDir, file));

                history.push({
                    author,
                    content,
                    timestamp: stat.mtimeMs, // Approx timestamp
                    iteration // Correctly parsed iteration
                });
            } catch (err) {
                console.warn(`Failed to read exchange file ${file}:`, err);
            }
        }

        // Sort by iteration (Round 2: Deterministic sort)
        return history.sort((a, b) => a.iteration - b.iteration);
    }
}
