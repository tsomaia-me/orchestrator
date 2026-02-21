import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildBriefing } from '../build-briefing'
import { TemplateManager } from '../template-manager'
import { RelayStore } from '../relay-store'
import { createEmptyState } from '../helpers'
import { makeTaskForPhase } from './fixtures/task-states'
import type { Phase } from '../types'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
}

describe('buildBriefing', () => {
  let projectRoot: string
  let store: RelayStore
  let templateManager: TemplateManager

  beforeEach(() => {
    projectRoot = createTempProjectRoot()
    store = new RelayStore({ initialState: createEmptyState() })
    templateManager = new TemplateManager(DEFAULT_TEMPLATE_DIR)
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  const getProjectRoot = () => projectRoot

  it('returns briefing_no_active_task when task is null and store has no active task', () => {
    const result = buildBriefing(null, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('No active task')
    expect(result.content[0].text).toContain('Head Planner')
  })

  it('returns briefing_awaiting_implementation_report for AWAITING_IMPLEMENTATION_REPORT', () => {
    const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
    const result = buildBriefing(task, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('ENGINEER')
    expect(result.content[0].text).toContain('post_implementation_report')
    expect(result.content[0].text).toContain(task.spec.objective)
  })

  it('returns briefing_awaiting_review for AWAITING_REVIEW', () => {
    const task = makeTaskForPhase('AWAITING_REVIEW')
    const result = buildBriefing(task, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('REVIEWER')
    expect(result.content[0].text).toContain('post_approval')
  })

  it('returns briefing_awaiting_comments_resolution for AWAITING_COMMENTS_RESOLUTION', () => {
    const task = makeTaskForPhase('AWAITING_COMMENTS_RESOLUTION')
    const result = buildBriefing(task, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('ENGINEER')
    expect(result.content[0].text).toContain('post_comments_resolution')
  })

  it('returns briefing_completed for COMPLETED', () => {
    const task = makeTaskForPhase('COMPLETED')
    const result = buildBriefing(task, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('COMPLETED')
    expect(result.content[0].text).toContain('Head Planner')
  })

  it('when task.phase is unknown, uses briefing_no_active_task', () => {
    const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
    const taskWithUnknownPhase = { ...task, phase: 'UNKNOWN' as any }
    const result = buildBriefing(taskWithUnknownPhase, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('No active task')
  })

  it('uses store.getActiveTask when available over passed task', () => {
    const taskFromStore = makeTaskForPhase('AWAITING_REVIEW')
    store.addTask({
      featureId: taskFromStore.featureId,
      taskId: taskFromStore.taskId,
      phase: taskFromStore.phase,
      spec: taskFromStore.spec,
      handoff: null,
    })
    store.setActiveFeature(taskFromStore.featureId)

    const differentTask = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
    const result = buildBriefing(differentTask, store, templateManager, getProjectRoot)
    expect(result.content[0].text).toContain('REVIEWER')
  })
})
