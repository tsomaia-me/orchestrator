/**
 * Effects: POJOs describing side effects.
 * All use type + dashed-lower-case naming.
 * Factories are pure functions.
 */

import type { RelayState } from './state';

/** Effects emitted by transformers. Discovery effects return values merged into state._discovered. */
export type Effect =
  | { type: 'persist-state'; state: RelayState }
  | { type: 'write-file'; path: string; content: string }
  | { type: 'read-state'; condition: (state: RelayState) => boolean }
  | { type: 'log'; message: string }
  | { type: 'prompt-user'; message: string; 'submit-command': string; path?: string }
  | { type: 'exit'; code: number }
  | { type: 'create-task-scaffold'; 'task-id': string }
  // Discovery (return value merged into state._discovered)
  | { type: 'discover-relay-root' }
  | { type: 'discover-project-root'; mode: 'init' | 'existing' }
  | { type: 'discover-features' }
  | { type: 'discover-path-exists'; path: string }
  | { type: 'discover-feature-exists'; feature: string }
  | { type: 'discover-read-file'; path: string }
  | { type: 'discover-fsm-input'; projectRoot: string; feature: string; persona: 'architect' | 'engineer'; submit: boolean }
  | { type: 'discover-feature-state'; feature: string }
  // CLI effects
  | { type: 'ensure-dir'; path: string }
  | { type: 'copy-file'; src: string; dest: string }
  | { type: 'move'; src: string; dest: string }
  | { type: 'prompt-confirm'; message: string; then: Effect[]; else: Effect[] }
  | { type: 'show-help' }
  | { type: 'show-prompt-file'; path: string; persona: 'architect' | 'engineer'; feature: string };

// ─── Effect factories ─────────────────────────────────────────────────────────

export function persistState(state: RelayState): Effect {
  return { type: 'persist-state', state };
}

export function writeFile(path: string, content: string): Effect {
  return { type: 'write-file', path, content };
}

export function readState(condition: (state: RelayState) => boolean): Effect {
  return { type: 'read-state', condition };
}

export function log(message: string): Effect {
  return { type: 'log', message };
}

export function promptUser(
  message: string,
  submitCommand: string,
  filePath?: string
): Effect {
  return { type: 'prompt-user', message, 'submit-command': submitCommand, path: filePath };
}

export function exit(code: number): Effect {
  return { type: 'exit', code };
}

export function createTaskScaffold(taskId: string): Effect {
  return { type: 'create-task-scaffold', 'task-id': taskId };
}

export function discoverRelayRoot(): Effect {
  return { type: 'discover-relay-root' };
}

export function discoverProjectRoot(mode: 'init' | 'existing'): Effect {
  return { type: 'discover-project-root', mode };
}

export function discoverFeatures(): Effect {
  return { type: 'discover-features' };
}

export function discoverPathExists(path: string): Effect {
  return { type: 'discover-path-exists', path };
}

export function discoverFeatureExists(feature: string): Effect {
  return { type: 'discover-feature-exists', feature };
}

export function discoverReadFile(path: string): Effect {
  return { type: 'discover-read-file', path };
}

export function discoverFsmInput(
  projectRoot: string,
  feature: string,
  persona: 'architect' | 'engineer',
  submit: boolean
): Effect {
  return { type: 'discover-fsm-input', projectRoot, feature, persona, submit };
}

export function discoverFeatureState(feature: string): Effect {
  return { type: 'discover-feature-state', feature };
}

export function ensureDir(path: string): Effect {
  return { type: 'ensure-dir', path };
}

export function copyFile(src: string, dest: string): Effect {
  return { type: 'copy-file', src, dest };
}

export function move(src: string, dest: string): Effect {
  return { type: 'move', src, dest };
}

export function promptConfirm(message: string, thenEffects: Effect[], elseEffects: Effect[]): Effect {
  return { type: 'prompt-confirm', message, then: thenEffects, else: elseEffects };
}

export function showHelp(): Effect {
  return { type: 'show-help' };
}

export function showPromptFile(path: string, persona: 'architect' | 'engineer', feature: string): Effect {
  return { type: 'show-prompt-file', path, persona, feature };
}
