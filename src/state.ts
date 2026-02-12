/**
 * Immutable state types for the relay FSM.
 * All types are pure; no side effects.
 */

export type Persona = 'architect' | 'engineer';

export type RelayStatus =
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected';

/** Persisted state in state.json */
export interface RelayState {
  currentTask: string;
  currentTaskSlug: string;
  iteration: number;
  lastAuthor: Persona | null;
  status: RelayStatus;
  createdAt: number;
  updatedAt: number;
}

/** Task info (from task files) - loaded by runner before FSM */
export interface TaskInfo {
  id: string;
  slug: string;
  filename: string;
  title: string;
  content: string;
  path: string;
}

/**
 * FSM input: everything the state machine needs to decide.
 * All loaded by runner before calling FSM - no I/O inside FSM.
 */
export interface FSMInput {
  state: RelayState;
  persona: Persona;
  feature: string;
  submit: boolean;
  planContent: string | null;
  tasks: TaskInfo[];
  directiveContent: string | null;
  reportContent: string | null;
  directivePath: string;
  reportPath: string;
  workDir: string;
  projectRoot: string;
}

/** Ephemeral discovery results - not persisted, merged into state between loop iterations */
export interface Discovered {
  projectRoot?: string | null;
  features?: string[];
  pathExists?: boolean;
  featureExists?: boolean;
  fileContent?: string;
  packageRoot?: string;
  fsmInput?: FSMInput;
  featureState?: RelayState;
}

/** App state: RelayState + optional ephemeral discovery. Persist omits _discovered. */
export type AppState = RelayState & { _discovered?: Discovered };

/** Default initial state */
export function createInitialState(): RelayState {
  const now = Date.now();
  return {
    currentTask: '',
    currentTaskSlug: '',
    iteration: 0,
    lastAuthor: null,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}
