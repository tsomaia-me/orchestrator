/**
 * CORE: Path Logic
 * Pure path generation.
 * V01: Whitelist taskId to prevent path traversal.
 */

import path from 'path';

/** V01: Reject taskIds that could cause path traversal. Whitelist: alphanumeric, hyphen, underscore. */
const TASK_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** V04/V-STAT-01: Max slug length to keep filename under 255 chars. taskId(64)+iter(3)+author(9)+suffix(4)=83, so slug≤172. */
const MAX_SLUG_LEN = 172;

/** V-03: Max taskId length to keep filename under 255 chars. */
const MAX_TASK_ID_LEN = 64;

/** V-PATH-01: Max total path length. Windows default MAX_PATH=260; use 259 for safety. */
const MAX_PATH_LEN = process.platform === 'win32' ? 259 : 4095;

export function validateTaskId(id: string): void {
    if (!TASK_ID_REGEX.test(id)) {
        throw new Error(`Invalid taskId: must match ^[a-zA-Z0-9_-]+$`);
    }
    if (id.length > MAX_TASK_ID_LEN) {
        throw new Error(`Invalid taskId: length exceeds ${MAX_TASK_ID_LEN} characters`);
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
    const slug = slugify(taskTitle).slice(0, MAX_SLUG_LEN);
    return `${taskId}-${iterStr}-${author}-${slug}.md`;
}

export function getExchangePath(
    rootDir: string,
    taskId: string,
    taskTitle: string,
    iteration: number,
    author: 'architect' | 'engineer'
): string {
    const fullPath = path.join(
        rootDir,
        '.relay',
        'exchanges',
        getExchangeFilename(taskId, taskTitle, iteration, author)
    );
    if (fullPath.length > MAX_PATH_LEN) {
        throw new Error(
            `Exchange path exceeds maximum length (${MAX_PATH_LEN}): ${fullPath.length} chars. Use a shorter root directory or task title.`
        );
    }
    return fullPath;
}
