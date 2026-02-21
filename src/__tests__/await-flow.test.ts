import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { handleAwait, getTransitionEvents } from '../await-flow'
import { TemplateManager } from '../template-manager'
import { RelayStore } from '../relay-store'
import { EventListener } from '../event-listener'
import { createEmptyState } from '../helpers'
import { makeTaskForPhase } from './fixtures/task-states'
import { REVIEWER_ACTIVE_PHASES } from '../types'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
}

describe('await-flow', () => {
  let projectRoot: string
  let store: RelayStore
  let templateManager: TemplateManager
  let eventBus: EventListener

  beforeEach(() => {
    projectRoot = createTempProjectRoot()
    store = new RelayStore({ initialState: createEmptyState() })
    templateManager = new TemplateManager(DEFAULT_TEMPLATE_DIR)
    eventBus = new EventListener()
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  const getProjectRoot = () => projectRoot

  describe('getTransitionEvents', () => {
    it('returns post_implementation_report for AWAITING_IMPLEMENTATION_REPORT', () => {
      const events = getTransitionEvents('feat', 'task1', 'AWAITING_IMPLEMENTATION_REPORT')
      expect(events).toEqual(['feat.task1.post_implementation_report'])
    })

    it('returns post_approval and post_rejection for AWAITING_REVIEW', () => {
      const events = getTransitionEvents('feat', 'task1', 'AWAITING_REVIEW')
      expect(events).toContain('feat.task1.post_approval')
      expect(events).toContain('feat.task1.post_rejection')
    })

    it('returns post_comments_resolution for AWAITING_COMMENTS_RESOLUTION', () => {
      const events = getTransitionEvents('feat', 'task1', 'AWAITING_COMMENTS_RESOLUTION')
      expect(events).toEqual(['feat.task1.post_comments_resolution'])
    })

    it('returns empty for COMPLETED', () => {
      const events = getTransitionEvents('feat', 'task1', 'COMPLETED')
      expect(events).toEqual([])
    })
  })

  describe('handleAwait', () => {
    it('returns no_active_task when store has no task and wait times out', async () => {
      const mockWait = () => Promise.resolve(null)
      const deps = {
        store,
        eventBus,
        templateManager,
        getProjectRoot,
        waitForAnyEventWithTimeout: mockWait,
      }
      const result = await handleAwait(
        REVIEWER_ACTIVE_PHASES,
        'await_engineer_update',
        deps,
        100,
      )
      expect(result.content[0].text).toContain('No active task yet')
      expect(result.content[0].text).toContain('await_engineer_update')
    })

    it('returns waiting_for_other when task phase not in activePhases and wait times out', async () => {
      const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
      store.addTask(task)
      const mockWait = () => Promise.resolve(null)
      const deps = {
        store,
        eventBus,
        templateManager,
        getProjectRoot,
        waitForAnyEventWithTimeout: mockWait,
      }
      const result = await handleAwait(
        REVIEWER_ACTIVE_PHASES,
        'await_engineer_update',
        deps,
        100,
      )
      expect(result.content[0].text).toContain('The other agent hasn\'t submitted yet')
      expect(result.content[0].text).toContain('AWAITING_IMPLEMENTATION_REPORT')
    })

    it('returns buildBriefing when task is in active phase', async () => {
      const task = makeTaskForPhase('AWAITING_REVIEW')
      store.addTask(task)
      const deps = {
        store,
        eventBus,
        templateManager,
        getProjectRoot,
        waitForAnyEventWithTimeout: () => Promise.resolve(null),
      }
      const result = await handleAwait(
        REVIEWER_ACTIVE_PHASES,
        'await_engineer_update',
        deps,
        100,
      )
      expect(result.content[0].text).toContain('REVIEWER')
      expect(result.content[0].text).toContain('post_approval')
    })

    it('returns buildBriefing when wait resolves with updated task', async () => {
      const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
      store.addTask(task)
      const updatedTask = { ...task, phase: 'AWAITING_REVIEW' as const }
      const mockWait = async () => {
        store.updateActiveTask(() => updatedTask)
        return updatedTask
      }
      const deps = {
        store,
        eventBus,
        templateManager,
        getProjectRoot,
        waitForAnyEventWithTimeout: mockWait,
      }
      const result = await handleAwait(
        REVIEWER_ACTIVE_PHASES,
        'await_engineer_update',
        deps,
        100,
      )
      expect(result.content[0].text).toContain('REVIEWER')
    })
  })
})
