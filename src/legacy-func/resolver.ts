/**
 * Path resolution utilities.
 * Pure functions for path building; findRelayRoot uses fs for discovery.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import type { RelayState } from './state';

/** Build path to .relay dir (pure) */
export function getRelayDir(projectRoot: string): string {
  return path.join(projectRoot, '.relay');
}

/** Build path to features dir (pure) */
export function getFeaturesDir(projectRoot: string): string {
  return path.join(projectRoot, '.relay', 'features');
}

/** Build path to a feature dir (pure) */
export function getFeatureDir(projectRoot: string, featureName: string): string {
  return path.join(projectRoot, '.relay', 'features', featureName);
}

/** Build path to archive dir (pure) */
export function getArchiveDir(projectRoot: string): string {
  return path.join(projectRoot, '.relay', 'archive');
}

/** Build exchange file path (pure). Format: {taskId}-{iter}-{author}-{slug}.md */
export function getExchangePath(
  featureDir: string,
  taskId: string,
  taskSlug: string,
  iteration: number,
  author: 'architect' | 'engineer'
): string {
  const iterStr = String(iteration).padStart(3, '0');
  const filename = `${taskId}-${iterStr}-${author}-${taskSlug}.md`;
  return path.join(featureDir, 'exchange', filename);
}

/**
 * Get path for next exchange file to WRITE (pure).
 * Architect/engineer uses this to know where to write directive/report.
 */
export function getNextExchangePath(
  state: RelayState,
  featureDir: string,
  author: 'architect' | 'engineer'
): { path: string; iteration: number } {
  if (!state.currentTask || !state.currentTaskSlug) {
    return { path: '', iteration: 0 };
  }

  let iteration = state.iteration;

  if (author === 'architect') {
    if (state.lastAuthor === null || state.lastAuthor === 'engineer') {
      iteration = state.iteration + 1;
    }
  } else {
    if (state.lastAuthor === 'architect' || state.lastAuthor === 'engineer') {
      iteration = state.iteration;
    } else {
      return { path: '', iteration: 0 };
    }
  }

  const filePath = getExchangePath(
    featureDir,
    state.currentTask,
    state.currentTaskSlug,
    iteration,
    author
  );
  return { path: filePath, iteration };
}

/**
 * Get path for latest exchange file to READ (pure).
 * Architect reads engineer's report; engineer reads architect's directive.
 */
export function getLatestExchangeToRead(
  state: RelayState,
  featureDir: string,
  reader: 'architect' | 'engineer'
): string | null {
  if (!state.currentTask || !state.currentTaskSlug) {
    return null;
  }

  const author = reader === 'architect' ? 'engineer' : 'architect';
  let targetIteration = state.iteration;

  if (reader === 'architect' && state.lastAuthor === 'architect') {
    targetIteration = state.iteration - 1;
  }

  if (reader === 'engineer' && state.lastAuthor === 'architect' && targetIteration < 1) {
    targetIteration = 1;
  }

  if (targetIteration < 1) {
    return null;
  }

  return getExchangePath(
    featureDir,
    state.currentTask,
    state.currentTaskSlug,
    targetIteration,
    author
  );
}

/** Predict directive path when we have task but no directive yet (pure) */
export function predictDirectivePath(
  featureDir: string,
  taskId: string,
  taskSlug: string,
  iteration: number
): string {
  return getExchangePath(featureDir, taskId, taskSlug, iteration, 'architect');
}

/**
 * Find .relay root by walking up from startDir.
 * Uses fs - call only at process boundary.
 */
export function findRelayRoot(startDir: string = process.cwd()): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;
  const home = os.homedir();

  while (current !== root && current !== home) {
    const relayPath = path.join(current, '.relay');
    if (fs.existsSync(relayPath) && fs.statSync(relayPath).isDirectory()) {
      return current;
    }
    current = path.dirname(current);
  }

  for (const dir of [root, home]) {
    const relayPath = path.join(dir, '.relay');
    if (fs.existsSync(relayPath) && fs.statSync(relayPath).isDirectory()) {
      return dir;
    }
  }
  return null;
}
