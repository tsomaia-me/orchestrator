import { Phase, TaskState } from '../../types'

const DEFAULT_SPEC = {
  objective: 'Test objective',
  requirements: ['req1', 'req2'],
  constraints: ['constraint1'],
}

export function makeTask(overrides: Partial<TaskState> & { phase?: Phase }): TaskState {
  return {
    featureId: 'feat-1',
    taskId: 'task-a',
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    spec: DEFAULT_SPEC,
    handoff: null,
    ...overrides,
  }
}

export function makeTaskForPhase(phase: Phase): TaskState {
  return makeTask({ phase })
}
