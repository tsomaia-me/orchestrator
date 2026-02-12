/**
 * CORE: Path Logic
 * Pure path generation.
 */

import path from 'path';

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
 */
export function getExchangeFilename(
    taskId: string,
    taskTitle: string,
    iteration: number,
    author: 'architect' | 'engineer'
): string {
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
