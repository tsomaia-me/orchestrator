/**
 * CORE: Path Logic
 * Pure path generation.
 * V01: Whitelist taskId to prevent path traversal.
 */

import path from 'path';

/** V01: Reject taskIds that could cause path traversal. Whitelist: alphanumeric, hyphen, underscore. */
const TASK_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

export function validateTaskId(id: string): void {
    if (!TASK_ID_REGEX.test(id)) {
        throw new Error(`Invalid taskId: must match ^[a-zA-Z0-9_-]+$`);
    }
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

/**
 * .relay/exchanges/{taskId}-{iter}-{author}-{slug}.md
 * V01: Validates taskId before building filename.
 */
export function getExchangeFilename(
    taskId: string,
    taskTitle: string,
    iteration: number,
    author: 'architect' | 'engineer'
): string {
    validateTaskId(taskId);
    const iterStr = String(iteration).padStart(3, '0');
    const slug = slugify(taskTitle);
    return `${taskId}-${iterStr}-${author}-${slug}.md`;
}

export function getExchangePath(
    rootDir: string,
    taskId: string,
    taskTitle: string,
    iteration: number,
    author: 'architect' | 'engineer'
): string {
    return path.join(
        rootDir,
        '.relay',
        'exchanges',
        getExchangeFilename(taskId, taskTitle, iteration, author)
    );
}
