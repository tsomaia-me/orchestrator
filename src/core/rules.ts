/**
 * CORE: Business Rules
 * Pure validation logic.
 */

import { Action } from './machine';
import { RelayState } from './state';
import { PulseStatus } from './state';

export function validateAction(state: RelayState, action: Action): void {
    switch (action.type) {
        case 'START_TASK':
            // V-STATE-01: Disallow double start — prevents orphan exchanges from task re-entry
            if (state.status !== 'idle' && state.status !== 'completed') {
                throw new Error(`Cannot start task in state: ${state.status}`);
            }
            break;

        case 'SUBMIT_DIRECTIVE':
            if (state.status !== 'planning' && state.status !== 'waiting_for_architect') {
                throw new Error(`Cannot submit directive in state: ${state.status}. Wait for Engineer report.`);
            }
            break;

        case 'SUBMIT_REPORT':
            if (state.status !== 'waiting_for_engineer') {
                throw new Error(`Cannot submit report in state: ${state.status}. Wait for Architect directive.`);
            }
            break;
    }
}

export function getInstructionsForRole(state: RelayState, role: 'architect' | 'engineer'): string {
    if (role === 'architect') {
        if (state.status === 'idle' || state.status === 'completed') return "ACT: Start a new task using `plan_task` tool.";
        if (state.status === 'planning') return "ACT: Submit your initial directive using `submit_directive`.";
        if (state.status === 'waiting_for_architect') return "ACT: Review Engineer report and submit next directive or close task.";
        if (state.status === 'waiting_for_engineer') return "WAIT: Engineer is working.";
    }

    if (role === 'engineer') {
        if (state.status === 'waiting_for_engineer') return "ACT: Read directive, implement, and `submit_report`.";
        return "WAIT: Architect is thinking.";
    }

    return "WAIT";
}
