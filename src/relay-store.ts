import { FeatureId, FeatureState, RelayState, StatePersistence, TaskId, TaskState } from './types'
import { createEmptyState } from './helpers'

/**
 * In-memory state store with synchronous persistence.
 * All mutations are immediately flushed to disk via the persistence layer.
 */
export class RelayStore {
  private state: RelayState
  private persistence: StatePersistence | undefined

  constructor(params: {
    initialState?: RelayState | null
    persistence?: StatePersistence
  }) {
    this.state = params.initialState ?? createEmptyState()
    this.persistence = params.persistence
  }

  /**
   * Rehydrate state from disk. Call once at startup.
   * If no persisted state exists, keeps the current (empty) state.
   */
  rehydrate(): void {
    if (this.persistence) {
      this.state = this.persistence.load()
    }
  }

  private flush(): void {
    if (this.persistence) {
      this.persistence.save(this.state)
    }
  }

  getState(): RelayState {
    return JSON.parse(JSON.stringify(this.state))
  }

  // ── Feature operations ──────────────────────────────────────────

  getFeature(featureId: FeatureId): FeatureState | null {
    const feature = this.state.features.find(f => f.id === featureId)
    return feature ? { ...feature, tasks: [...feature.tasks] } : null
  }

  // ── Task operations ─────────────────────────────────────────────

  getTask(featureId: FeatureId, taskId: TaskId): TaskState {
    const task = this.getFeature(featureId)?.tasks
      .find(t => t.taskId === taskId)

    if (!task) {
      throw new Error(`Task not found: ${featureId}/${taskId}`)
    }
    return task
  }

  getActiveTask(): TaskState | null {
    if (!this.state.currentContext) {
      return null
    }
    const { featureId, taskId } = this.state.currentContext
    try {
      return this.getTask(featureId, taskId)
    } catch {
      return null
    }
  }

  /**
   * Returns the next incomplete task AFTER the current one in the feature.
   * Returns null if there are no more tasks.
   */
  getNextTask(): TaskState | null {
    if (!this.state.currentContext) {
      return null
    }

    const { featureId, taskId } = this.state.currentContext
    const feature = this.getFeature(featureId)

    if (!feature?.tasks?.length) {
      return null
    }

    const currentIndex = feature.tasks.findIndex(t => t.taskId === taskId)
    if (currentIndex === -1) {
      return null
    }

    // slice AFTER current task, find first non-completed
    return feature.tasks
      .slice(currentIndex + 1)
      .find(t => t.phase !== 'COMPLETED') ?? null
  }

  // ── Mutations ───────────────────────────────────────────────────

  setActiveFeature(featureId: FeatureId): void {
    const feature = this.state.features.find(f => f.id === featureId)
    if (!feature) {
      throw new Error('No feature found with ID: ' + featureId)
    }

    const task = feature.tasks.find(t => t.phase !== 'COMPLETED')
    if (!task) {
      throw new Error(`Feature ${featureId} has no pending tasks`)
    }

    this.state.currentContext = { featureId, taskId: task.taskId }
    this.flush()
  }

  addTask(task: TaskState): void {
    let feature = this.state.features.find(f => f.id === task.featureId)

    if (!feature) {
      feature = { id: task.featureId, tasks: [] }
      this.state.features.push(feature)
    }

    if (feature.tasks.some(t => t.taskId === task.taskId)) {
      throw new Error(`Duplicate taskId: ${task.featureId}/${task.taskId}`)
    }

    feature.tasks.push(task)

    // Auto-activate: if no current context, set this as active
    if (!this.state.currentContext) {
      this.state.currentContext = {
        featureId: task.featureId,
        taskId: task.taskId,
      }
    }

    this.flush()
  }

  updateActiveTask(update: (prev: TaskState) => TaskState): void {
    if (!this.state.currentContext) {
      throw new Error('No active task to update')
    }

    const { featureId, taskId } = this.state.currentContext
    const feature = this.getFeature(featureId)

    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`)
    }

    const index = feature.tasks.findIndex(t => t.taskId === taskId)
    if (index === -1) {
      throw new Error(`Task not found: ${featureId}/${taskId}`)
    }

    feature.tasks[index] = update(feature.tasks[index])
    this.flush()
  }

  /**
   * Mark the current task as COMPLETED and advance currentContext
   * to the next incomplete task. Returns the next task or null if done.
   */
  advanceToNextTask(): TaskState | null {
    // Mark current as completed
    this.updateActiveTask(prev => ({
      ...prev,
      phase: 'COMPLETED',
    }))

    const nextTask = this.getNextTask()

    if (nextTask) {
      this.state.currentContext = {
        featureId: nextTask.featureId,
        taskId: nextTask.taskId,
      }
    } else {
      // All tasks in this feature are done
      this.state.currentContext = null
    }

    this.flush()
    return nextTask
  }
}
