/**
 * CORE: State Machine Tests
 * Run with: npx tsx --test src/core/machine.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { reducer } from './machine';
import { INITIAL_STATE } from './state';

describe('Relay State Machine', () => {
    it('should start a task', () => {
        const state = reducer(INITIAL_STATE, {
            type: 'START_TASK',
            taskId: '123',
            taskTitle: 'Test Task',
            timestamp: 1000
        });

        assert.strictEqual(state.status, 'planning');
        assert.strictEqual(state.activeTaskId, '123');
        assert.strictEqual(state.iteration, 1);
    });

    it('should transition to waiting_for_engineer on REJECT directive', () => {
        const startState = reducer(INITIAL_STATE, {
            type: 'START_TASK',
            taskId: '123',
            taskTitle: 'Test Task',
            timestamp: 1000
        });

        const nextState = reducer(startState, {
            type: 'SUBMIT_DIRECTIVE',
            taskId: '123',
            decision: 'REJECT', // "Needs work" or "Start"
            timestamp: 2000
        });

        assert.strictEqual(nextState.status, 'waiting_for_engineer');
        assert.strictEqual(nextState.iteration, 1); // Iteration 1 starts
    });

    it('should transition to waiting_for_architect on report', () => {
        const startState = reducer(INITIAL_STATE, {
            type: 'START_TASK',
            taskId: '123',
            taskTitle: 'Test Task',
            timestamp: 1000
        });

        const directiveState = reducer(startState, {
            type: 'SUBMIT_DIRECTIVE',
            taskId: '123',
            decision: 'REJECT',
            timestamp: 2000
        });

        const reportState = reducer(directiveState, {
            type: 'SUBMIT_REPORT',
            taskId: '123',
            status: 'COMPLETED',
            timestamp: 3000
        });

        assert.strictEqual(reportState.status, 'waiting_for_architect');
        assert.strictEqual(reportState.iteration, 1);
    });

    it('should increment iteration on next directive (Loop)', () => {
        // Setup state where Architect has received a report
        const state = {
            ...INITIAL_STATE,
            status: 'waiting_for_architect',
            activeTaskId: '123',
            iteration: 1,
            lastActionBy: 'engineer'
        } as const;

        // Architect rejects work -> New Directive -> Next Iteration
        const nextState = reducer(state as any, {
            type: 'SUBMIT_DIRECTIVE',
            taskId: '123',
            decision: 'REJECT',
            timestamp: 2000
        });

        assert.strictEqual(nextState.status, 'waiting_for_engineer');
        assert.strictEqual(nextState.iteration, 2);
    });

    it('should complete task on APPROVE directive', () => {
        const state = {
            ...INITIAL_STATE,
            status: 'waiting_for_architect',
            activeTaskId: '123',
            iteration: 2,
            lastActionBy: 'engineer'
        } as const;

        const nextState = reducer(state as any, {
            type: 'SUBMIT_DIRECTIVE',
            taskId: '123',
            decision: 'APPROVE',
            timestamp: 2000
        });

        assert.strictEqual(nextState.status, 'completed');
        assert.strictEqual(nextState.iteration, 3); // Iteration increments on final turn
    });
});
