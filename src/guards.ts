import { Phase, TaskState } from './types'

export interface TaskStore {
  getActiveTask(): TaskState | null
}

export function requireActiveTask(store: TaskStore): TaskState {
  const task = store.getActiveTask()
  if (!task) {
    throw new Error('No active task. Create tasks with `create_task` and set the active feature with `set_active_feature` first.')
  }
  return task
}

export function requirePhase(task: TaskState, ...allowed: Phase[]): void {
  if (!allowed.includes(task.phase)) {
    throw new Error(
      `Phase mismatch: current phase is ${task.phase}, ` +
      `but this tool requires ${allowed.join(' or ')}. ` +
      `Call the appropriate await tool to check the current state.`
    )
  }
}
