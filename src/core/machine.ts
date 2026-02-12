/**
 * CORE: State Machine Reducer
 * Pure function: (State, Action) -> State
 * Remediation F3: Reducer validates transitions; throws on invalid.
 */

import { RelayState, INITIAL_STATE, PulseStatus } from './state';
import { validateAction } from './rules';

export type Action =
    | { type: 'START_TASK'; taskId: string; taskTitle: string; timestamp: number }
    | { type: 'SUBMIT_DIRECTIVE'; taskId: string; decision: 'APPROVE' | 'REJECT'; timestamp: number }
    | { type: 'SUBMIT_REPORT'; taskId: string; status: 'COMPLETED' | 'FAILED'; timestamp: number };

export function reducer(state: RelayState = INITIAL_STATE, action: Action): RelayState {
    const now = action.timestamp;

    switch (action.type) {
        case 'START_TASK': {
            validateAction(state, action);
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
            validateAction(state, action);
            if (state.activeTaskId !== action.taskId) {
                throw new Error(`Task ID mismatch: Expected ${state.activeTaskId}, got ${action.taskId}`);
            }

            // V07: Iteration is monotonic, incremented only on SUBMIT_REPORT. No status-based logic.
            const nextIteration = state.iteration;

            // If approved, complete the task
            if (action.decision === 'APPROVE') {
                return {
                    ...state,
                    status: 'completed',
                    iteration: nextIteration,
                    lastActionBy: 'architect',
                    updatedAt: now,
                };
            }

            return {
                ...state,
                status: 'waiting_for_engineer',
                iteration: nextIteration,
                lastActionBy: 'architect',
                updatedAt: now,
            };
        }

        case 'SUBMIT_REPORT': {
            validateAction(state, action);
            if (state.activeTaskId !== action.taskId) {
                throw new Error(`Task ID mismatch: Expected ${state.activeTaskId}, got ${action.taskId}`);
            }

            const nextStatus: PulseStatus = action.status === 'COMPLETED'
                ? 'waiting_for_architect' // Architect reviews completion
                : 'waiting_for_architect'; // Architect reviews failure

            // V07: Monotonic iteration — increment on every SUBMIT_REPORT (engineer turn).
            // Decouples iteration from status strings.
            return {
                ...state,
                status: nextStatus,
                iteration: state.iteration + 1,
                lastActionBy: 'engineer',
                updatedAt: now,
            };
        }

        default:
            return state;
    }
}
