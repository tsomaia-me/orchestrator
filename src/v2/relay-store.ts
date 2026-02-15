import { FeatureId, FeatureState, RelayState, StatePersistence, TaskId, TaskState } from './types'
import { createEmptyState } from './helpers'

export class RelayStore {
  private state: RelayState
  private persistence: StatePersistence | undefined

  constructor(params: {
    initialState?: RelayState | null
    persistence?: StatePersistence
  }) {
    const { initialState, persistence } = params
    this.state = initialState ?? createEmptyState()
    this.persistence = persistence
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state))
  }

  setState(state: RelayState) {
    this.state = state
    this.persistence?.save(state)
  }

  getFeature(
    featureId: FeatureId,
  ): FeatureState | null {
    return this.state.features
      .find(feature => feature.id === featureId) ?? null
  }

  getTask(
    featureId: FeatureId,
    taskId: TaskId,
  ): TaskState | null {
    return this.getFeature(featureId)?.tasks
      .find(task => task.taskId === taskId) ?? null
  }

  getActiveTask() {
    if (!this.state.currentContext) {
      return null
    }

    const { featureId, taskId } = this.state.currentContext

    return this.getTask(featureId, taskId)
  }

  getNextTask() {
    if (!this.state.currentContext) {
      return null
    }

    const { featureId, taskId } = this.state.currentContext
    const feature = this.getFeature(featureId)

    if (!feature?.tasks?.length) {
      return null
    }

    const index = feature.tasks
      .findIndex(task => task.taskId === taskId) ?? -1

    return feature.tasks[index + 1] ?? null
  }

  setActiveTask(featureId: FeatureId, taskId: TaskId) {
    const task = this.getTask(featureId, taskId)

    if (!task) {
      throw new Error(`Task ${featureId}.${taskId} not found`)
    }

    this.state.currentContext = { featureId, taskId }
    this.persistence?.save(this.state)
  }

  addTask(task: TaskState) {
    const feature = this.getFeature(task.featureId)

    if (!feature) {
      this.state.features.push({
        id: task.featureId,
        tasks: [task],
      })
    } else {
      feature.tasks.push(task)
    }

    this.persistence?.save(this.state)
  }

  updateTask(
    featureId: FeatureId,
    taskId: TaskId,
    update: (prev: TaskState) => TaskState,
  ) {
    const feature = this.getFeature(featureId)
    const task = this.getTask(featureId, taskId)

    if (feature && task) {
      feature.tasks = feature.tasks.map(t => t.taskId === taskId ? update(task) : t)
      this.persistence?.save(this.state)
    }
  }

  updateActiveTask(update: (prev: TaskState) => TaskState) {
    if (this.state.currentContext) {
      const { featureId, taskId } = this.state.currentContext

      this.updateTask(featureId, taskId, update)
    }
  }
}
