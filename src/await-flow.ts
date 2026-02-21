import { TemplateManager } from './template-manager'
import { buildBriefing } from './build-briefing'
import {
  Phase,
  TaskEventName,
  TaskEventListener,
  TaskState,
} from './types'

export interface BriefingStore {
  getActiveTask(): TaskState | null
}

export interface EventBus {
  on(event: TaskEventName, listener: TaskEventListener): void
  off(event: TaskEventName, listener: TaskEventListener): void
}

export type WaitForEventsFn = (
  events: TaskEventName[],
  timeoutMs: number,
) => Promise<TaskState | null>

export interface HandleAwaitDeps {
  store: BriefingStore
  eventBus: EventBus
  templateManager: TemplateManager
  getProjectRoot: () => string
  waitForAnyEventWithTimeout: WaitForEventsFn
}

/**
 * Create the default wait implementation using the event bus.
 */
export function createDefaultWait(eventBus: EventBus): WaitForEventsFn {
  return function waitForAnyEventWithTimeout(
    events: TaskEventName[],
    timeoutMs: number,
  ): Promise<TaskState | null> {
    if (events.length === 0) {
      return Promise.resolve(null)
    }

    return new Promise<TaskState | null>(resolve => {
      let settled = false
      const registeredListeners: { event: TaskEventName; fn: TaskEventListener }[] = []

      const cleanup = () => {
        clearTimeout(timer)
        registeredListeners.forEach(({ event, fn }) => eventBus.off(event, fn))
      }

      const settle = (result: TaskState | null) => {
        if (!settled) {
          settled = true
          cleanup()
          resolve(result)
        }
      }

      const timer = setTimeout(() => settle(null), timeoutMs)

      events.forEach(event => {
        const fn: TaskEventListener = (payload) => settle(payload)
        eventBus.on(event, fn)
        registeredListeners.push({ event, fn })
      })
    })
  }
}

/**
 * Determine which events would cause a phase transition relevant to the waiting role.
 */
export function getTransitionEvents(
  featureId: string,
  taskId: string,
  phase: Phase,
): TaskEventName[] {
  const prefix = `${featureId}.${taskId}` as const
  switch (phase) {
    case 'AWAITING_IMPLEMENTATION_REPORT':
      return [`${prefix}.post_implementation_report`]
    case 'AWAITING_REVIEW':
      return [`${prefix}.post_approval`, `${prefix}.post_rejection`]
    case 'AWAITING_COMMENTS_RESOLUTION':
      return [`${prefix}.post_comments_resolution`]
    case 'COMPLETED':
      return []
    default:
      return []
  }
}

/**
 * Core logic for both await tools.
 * If the current phase is in the caller's active phases, return immediately.
 * Otherwise, block up to timeoutMs waiting for a relevant event.
 */
export async function handleAwait(
  activePhases: readonly Phase[],
  thisToolName: string,
  deps: HandleAwaitDeps,
  timeoutMs: number,
): Promise<{ content: [{ type: 'text'; text: string }] }> {
  const { store, templateManager, getProjectRoot, waitForAnyEventWithTimeout } = deps
  let task = store.getActiveTask()

  if (!task) {
    const waitTask = await waitForAnyEventWithTimeout(['set_active_task'], timeoutMs)
    if (!waitTask) {
      templateManager.initialize(getProjectRoot())
      const text = templateManager.render('await_update.mx', {
        state: 'no_active_task',
        thisToolName,
      })
      return { content: [{ type: 'text' as const, text }] }
    }
    task = waitTask
  }

  if (!activePhases.includes(task.phase)) {
    const { featureId, taskId, phase } = task
    const eventsToWatch = getTransitionEvents(featureId, taskId, phase)
    const updatedTask = await waitForAnyEventWithTimeout(eventsToWatch, timeoutMs)

    if (!updatedTask) {
      templateManager.initialize(getProjectRoot())
      const text = templateManager.render('await_update.mx', {
        state: 'waiting_for_other',
        phase,
        thisToolName,
      })
      return { content: [{ type: 'text' as const, text }] }
    }
    task = updatedTask
  }

  return buildBriefing(task, store, templateManager, getProjectRoot)
}
