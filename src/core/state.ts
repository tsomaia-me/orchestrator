/**
 * CORE: Immutable State Models
 * Pure definitions. No logic.
 */

export type Role = 'architect' | 'engineer';

export type PulseStatus =
    | 'idle'
    | 'planning' // Architect is thinking / waiting to submit directive
    | 'waiting_for_engineer' // Architect submitted directive
    | 'waiting_for_architect' // Engineer submitted report
    | 'completed';

export interface RelayState {
    readonly status: PulseStatus;
    readonly activeTaskId: string | null;
    readonly activeTaskTitle: string | null;
    /** Iteration counter. 1-based. V07/V-INV-05: Incremented on SUBMIT_REPORT (engineer turn).
     * Files: {taskId}-{001}-architect, {taskId}-{002}-engineer, {taskId}-{002}-architect, ...
     * Iteration = report count; architect/engineer of same turn may differ by index. */
    readonly iteration: number;
    /** Who performed the last significant action? */
    readonly lastActionBy: Role | null;
    readonly updatedAt: number;
}

/** Initial State Factory (Pure) */
export const INITIAL_STATE: RelayState = {
    status: 'idle',
    activeTaskId: null,
    activeTaskTitle: null,
    iteration: 0,
    lastActionBy: null,
    updatedAt: Date.now(),
};

/** Context View for Agents (What they see via relay://context) */
export interface AgentContext {
    readonly role: Role;
    readonly state: RelayState;
    readonly taskContent?: string;
    readonly lastExchangeContent?: string; // Report or Directive
    readonly instructions: string; // "WAIT" or "ACT"
}
