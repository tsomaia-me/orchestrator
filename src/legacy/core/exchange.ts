import path from 'path';
import { getFeatureDir } from './resolver';
import { FeatureState, TaskFile, saveFeatureState, loadFeatureState } from './feature';

/**
 * Generate deterministic exchange file path
 * Format: <TASK-ID>-<ITERATION>-<AUTHOR>-<SLUG>.md
 * 
 * Example: 001-002-engineer-login-form.md
 */
export function getExchangePath(
    projectRoot: string,
    featureName: string,
    taskId: string,
    taskSlug: string,
    iteration: number,
    author: 'architect' | 'engineer'
): string {
    const iterStr = String(iteration).padStart(3, '0');
    const filename = `${taskId}-${iterStr}-${author}-${taskSlug}.md`;

    return path.join(
        getFeatureDir(projectRoot, featureName),
        'exchange',
        filename
    );
}

/**
 * Get the path for the next exchange file (for writing)
 */
export async function getNextExchangePath(
    projectRoot: string,
    featureName: string,
    author: 'architect' | 'engineer'
): Promise<{ path: string; iteration: number }> {
    const state = await loadFeatureState(projectRoot, featureName);

    if (!state.currentTask || !state.currentTaskSlug) {
        throw new Error('No current task set. Architect must first create a directive.');
    }

    // Determine iteration based on author and last author
    let iteration = state.iteration;

    if (author === 'architect') {
        // Architect always starts or advances iteration
        if (state.lastAuthor === null || state.lastAuthor === 'engineer') {
            iteration = state.iteration + 1;
        }
    } else {
        // Engineer uses same iteration as the directive they're responding to
        // If last author was architect: normal flow
        // If last author was engineer: retry flow
        if (state.lastAuthor === 'architect' || state.lastAuthor === 'engineer') {
            // Same iteration as the directive (or retry)
            iteration = state.iteration;
        } else {
            throw new Error('Cannot write report: no directive to respond to');
        }
    }

    const filePath = getExchangePath(
        projectRoot,
        featureName,
        state.currentTask,
        state.currentTaskSlug,
        iteration,
        author
    );

    return { path: filePath, iteration };
}

/**
 * Get the path to read the latest exchange from the other author
 */
export async function getLatestExchangeToRead(
    projectRoot: string,
    featureName: string,
    reader: 'architect' | 'engineer'
): Promise<string | null> {
    const state = await loadFeatureState(projectRoot, featureName);

    if (!state.currentTask || !state.currentTaskSlug) {
        return null;
    }

    // Reader reads from the OTHER author
    const author = reader === 'architect' ? 'engineer' : 'architect';

    // For architect reading engineer's report:
    // - If last author was engineer, read current iteration
    // - If last author was architect (retry/in-progress), read previous iteration
    let targetIteration = state.iteration;

    if (reader === 'architect' && state.lastAuthor === 'architect') {
        targetIteration = state.iteration - 1;
    }

    if (targetIteration < 1) {
        return null; // No exchanges yet
    }

    return getExchangePath(
        projectRoot,
        featureName,
        state.currentTask,
        state.currentTaskSlug,
        targetIteration,
        author
    );
}

/**
 * Update state after writing an exchange
 */
export async function recordExchange(
    projectRoot: string,
    featureName: string,
    task: TaskFile,
    author: 'architect' | 'engineer',
    iteration: number
): Promise<void> {
    const state = await loadFeatureState(projectRoot, featureName);

    state.currentTask = task.id;
    state.currentTaskSlug = task.slug;
    state.iteration = iteration;
    state.lastAuthor = author;
    state.status = 'in_progress';

    await saveFeatureState(projectRoot, featureName, state);
}

/**
 * Mark task as approved
 */
export async function approveTask(
    projectRoot: string,
    featureName: string
): Promise<void> {
    const state = await loadFeatureState(projectRoot, featureName);
    state.status = 'approved';
    await saveFeatureState(projectRoot, featureName, state);
}

/**
 * Mark task as rejected
 */
export async function rejectTask(
    projectRoot: string,
    featureName: string
): Promise<void> {
    const state = await loadFeatureState(projectRoot, featureName);
    state.status = 'rejected';
    await saveFeatureState(projectRoot, featureName, state);
}
