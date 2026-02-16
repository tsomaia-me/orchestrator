import { TaskEventListener, TaskEventName, TaskState } from './types'

/**
 * Simple in-process event bus.
 * Enables one MCP client's tool call to unblock another client's
 * pending `await_*_update` Promise within the same server process.
 */
export class EventListener {
  private listeners = new Map<TaskEventName, TaskEventListener[]>()

  on(event: TaskEventName, listener: TaskEventListener): void {
    const existing = this.listeners.get(event)
    if (existing) {
      existing.push(listener)
    } else {
      this.listeners.set(event, [listener])
    }
  }

  off(event: TaskEventName, listener: TaskEventListener): void {
    const existing = this.listeners.get(event)
    if (existing) {
      this.listeners.set(event, existing.filter(l => l !== listener))
    }
  }

  /**
   * Returns a Promise that resolves when 'event' is triggered.
   * Used for one-shot waits (auto-unregisters after first fire).
   */
  listen(event: TaskEventName): Promise<TaskState> {
    return new Promise(resolve => {
      const handler: TaskEventListener = (payload: TaskState) => {
        this.off(event, handler)
        resolve(payload)
      }
      this.on(event, handler)
    })
  }

  trigger(event: TaskEventName, payload: TaskState): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      // Snapshot to avoid mutation during iteration
      [...handlers].forEach(h => h(payload))
    }
  }
}
