/**
 * CORE: State Machine Reducer
 * Pure function: (State, Action) -> State
 */

import { RelayState, INITIAL_STATE, PulseStatus } from './state';

export type Action =
    | { type: 'START_TASK'; taskId: string; taskTitle: string }
    | { type: 'SUBMIT_DIRECTIVE'; taskId: string }
    | { type: 'SUBMIT_REPORT'; taskId: string; status: 'COMPLETED' | 'FAILED' };

export function reducer(state: RelayState = INITIAL_STATE, action: Action): RelayState {
    const now = Date.now();

    switch (action.type) {
        case 'START_TASK': {
            // Architect starts a new task
            // Transition: idle/completed -> planning
            return {
                ...state,
                status: 'planning',
                activeTaskId: action.taskId,
                activeTaskTitle: action.taskTitle,
                iteration: 1,
                lastActionBy: 'architect',
                updatedAt: now,
            };
        }

        case 'SUBMIT_DIRECTIVE': {
            // Architect submits instructions
            // Transition: planning -> waiting_for_engineer
            // OR: waiting_for_architect -> waiting_for_engineer (Iterative loop)

            // Simple validation: ID must match
            if (state.activeTaskId !== action.taskId) {
                throw new Error(`Task ID mismatch: Expected ${state.activeTaskId}, got ${action.taskId}`);
            }

            return {
                ...state,
                status: 'waiting_for_engineer',
                lastActionBy: 'architect',
                updatedAt: now,
            };
        }

        case 'SUBMIT_REPORT': {
            // Engineer submits work
            // Transition: waiting_for_engineer -> waiting_for_architect

            if (state.activeTaskId !== action.taskId) {
                throw new Error(`Task ID mismatch: Expected ${state.activeTaskId}, got ${action.taskId}`);
            }

            const nextStatus: PulseStatus = action.status === 'COMPLETED'
                ? 'waiting_for_architect' // Architect reviews completion
                : 'waiting_for_architect'; // Architect reviews failure

            return {
                ...state,
                status: nextStatus,
                lastActionBy: 'engineer',
                // Increment iteration only after a full cycle (Arch -> Eng -> Arch?)
                // Let's increment on report submission to signify a "Turn" complete?
                // Or keep it simple: Iteration increases when Architect creates a new Directive (Next Loop).
                // Let's keep iteration stable here.
                updatedAt: now,
            };
        }

        default:
            return state;
    }
}
