import { TaskEventListener, TaskEventName, TaskState } from './types'


export class EventListener {
  listeners = new Map<TaskEventName, TaskEventListener[]>

  on(
    event: TaskEventName,
    listener: TaskEventListener,
  ) {
    const listeners = this.listeners.get(event)

    if (!listeners) {
      this.listeners.set(event, [listener])
    } else {
      listeners.push(listener)
    }
  }

  off(
    event: TaskEventName,
    listener: TaskEventListener,
  ) {
    const listeners = this.listeners.get(event)

    if (listeners) {
      this.listeners.set(event, listeners.filter(l => l !== listener))
    }
  }

  trigger(event: TaskEventName, payload: TaskState) {
    const listeners = this.listeners.get(event)?.forEach(l => {
      l(payload)
    })
  }
}
