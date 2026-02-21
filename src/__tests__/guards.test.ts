import { requireActiveTask, requirePhase } from '../guards'
import { RelayStore } from '../relay-store'
import { createEmptyState } from '../helpers'
import { makeTaskForPhase } from './fixtures/task-states'

describe('guards', () => {
  describe('requireActiveTask', () => {
    it('throws when store has no active task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      expect(() => requireActiveTask(store)).toThrow(/No active task/)
      expect(() => requireActiveTask(store)).toThrow(/create_task/)
      expect(() => requireActiveTask(store)).toThrow(/set_active_feature/)
    })

    it('returns task when store has active task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT'))
      const task = requireActiveTask(store)
      expect(task).not.toBeNull()
      expect(task.taskId).toBe('task-a')
    })
  })

  describe('requirePhase', () => {
    it('throws when task.phase not in allowed', () => {
      const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
      expect(() => requirePhase(task, 'AWAITING_REVIEW')).toThrow(/Phase mismatch/)
      expect(() => requirePhase(task, 'AWAITING_REVIEW')).toThrow(/AWAITING_IMPLEMENTATION_REPORT/)
    })

    it('does not throw when phase in allowed', () => {
      const task = makeTaskForPhase('AWAITING_REVIEW')
      expect(() => requirePhase(task, 'AWAITING_REVIEW')).not.toThrow()
    })
  })
})
