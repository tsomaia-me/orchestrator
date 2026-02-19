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

  trigger(event: TaskEventName, payload: TaskState): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      // Snapshot to avoid mutation during iteration
      [...handlers].forEach(h => h(payload))
    }
  }
}
