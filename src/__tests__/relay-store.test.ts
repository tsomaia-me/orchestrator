import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { RelayStore } from '../relay-store'
import { FilePersistence } from '../persistence/file-persistence'
import { createEmptyState } from '../helpers'
import { makeTask } from './fixtures/task-states'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-store-test-'))
}

describe('RelayStore', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('addTask', () => {
    it('auto-activates first task when no currentContext', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      const task = makeTask({ featureId: 'feat-1', taskId: 'task-1' })
      store.addTask(task)
      const active = store.getActiveTask()
      expect(active).not.toBeNull()
      expect(active!.featureId).toBe('feat-1')
      expect(active!.taskId).toBe('task-1')
    })

    it('does not overwrite currentContext when adding task to different feature', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ featureId: 'feat-A', taskId: 'task-1' }))
      store.addTask(makeTask({ featureId: 'feat-B', taskId: 'task-1' }))
      const active = store.getActiveTask()
      expect(active!.featureId).toBe('feat-A')
    })

    it('throws on duplicate taskId in same feature', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ featureId: 'feat-1', taskId: 'task-1' }))
      expect(() => store.addTask(makeTask({ featureId: 'feat-1', taskId: 'task-1' }))).toThrow(
        /Duplicate taskId/,
      )
    })
  })

  describe('setActiveFeature', () => {
    it('selects first non-completed task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ taskId: 'task-1', phase: 'AWAITING_IMPLEMENTATION_REPORT' }))
      store.addTask(makeTask({ taskId: 'task-2', phase: 'AWAITING_IMPLEMENTATION_REPORT' }))
      store.updateActiveTask(prev => ({ ...prev, phase: 'COMPLETED' }))
      store.addTask(makeTask({ taskId: 'task-3', phase: 'AWAITING_IMPLEMENTATION_REPORT' }))
      store.setActiveFeature('feat-1')
      const active = store.getActiveTask()
      expect(active!.taskId).toBe('task-2')
    })

    it('throws when feature has no pending tasks', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ phase: 'COMPLETED' }))
      expect(() => store.setActiveFeature('feat-1')).toThrow(/has no pending tasks/)
    })

    it('throws when feature not found', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      expect(() => store.setActiveFeature('nonexistent')).toThrow(/No feature found/)
    })
  })

  describe('advanceToNextTask', () => {
    it('marks current COMPLETED and switches to next task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ taskId: 'task-1' }))
      store.addTask(makeTask({ taskId: 'task-2' }))
      const next = store.advanceToNextTask()
      expect(next).not.toBeNull()
      expect(next!.taskId).toBe('task-2')
      expect(store.getActiveTask()!.taskId).toBe('task-2')
      const state = store.getState()
      const task1 = state.features[0].tasks.find(t => t.taskId === 'task-1')
      expect(task1!.phase).toBe('COMPLETED')
    })

    it('clears currentContext when no next task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ taskId: 'task-1' }))
      const next = store.advanceToNextTask()
      expect(next).toBeNull()
      expect(store.getActiveTask()).toBeNull()
      const state = store.getState()
      expect(state.currentContext).toBeNull()
    })
  })

  describe('getNextTask', () => {
    it('returns null when current is last task', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ taskId: 'task-1' }))
      const next = store.getNextTask()
      expect(next).toBeNull()
    })

    it('returns correct next by array order', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      store.addTask(makeTask({ taskId: 'task-a' }))
      store.addTask(makeTask({ taskId: 'task-b' }))
      store.addTask(makeTask({ taskId: 'task-c' }))
      const next = store.getNextTask()
      expect(next!.taskId).toBe('task-b')
    })
  })

  describe('updateActiveTask', () => {
    it('throws when no currentContext', () => {
      const store = new RelayStore({ initialState: createEmptyState() })
      expect(() => store.updateActiveTask(t => t)).toThrow(/No active task/)
    })
  })

  describe('rehydrate and stale currentContext', () => {
    it('getActiveTask returns null when currentContext points to missing task', () => {
      const persist = new FilePersistence(path.join(tempDir, '.relay', 'state.json'))
      persist.save({
        features: [{ id: 'feat-1', tasks: [] }],
        currentContext: { featureId: 'feat-1', taskId: 'ghost' },
      })
      const store = new RelayStore({ persistence: persist })
      store.rehydrate()
      const active = store.getActiveTask()
      expect(active).toBeNull()
    })
  })

  describe('persistence round-trip', () => {
    it('mutations flush and rehydrate restores state', () => {
      const statePath = path.join(tempDir, '.relay', 'state.json')
      const persist = new FilePersistence(statePath)
      const store1 = new RelayStore({ persistence: persist })
      store1.addTask(makeTask({ featureId: 'f1', taskId: 't1' }))
      store1.addTask(makeTask({ featureId: 'f1', taskId: 't2' }))
      const store2 = new RelayStore({ persistence: persist })
      store2.rehydrate()
      const state1 = store1.getState()
      const state2 = store2.getState()
      expect(state2.features).toHaveLength(state1.features.length)
      expect(state2.features[0].tasks).toHaveLength(2)
      expect(state2.currentContext).toEqual(state1.currentContext)
    })
  })
})
