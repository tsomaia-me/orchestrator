import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TemplateManager } from '../../template-manager'
import { makeTaskForPhase } from '../fixtures/task-states'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
}

describe('Briefing templates', () => {
  let projectRoot: string
  let manager: TemplateManager

  beforeEach(() => {
    projectRoot = createTempProjectRoot()
    manager = new TemplateManager(DEFAULT_TEMPLATE_DIR)
    manager.initialize(projectRoot)
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  it('briefing_awaiting_implementation_report.mx contains spec fields', () => {
    const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
    const text = manager.render('briefing_awaiting_implementation_report.mx', { task })
    expect(text).toContain('ENGINEER')
    expect(text).toContain('post_implementation_report')
    expect(text).toContain(task.featureId)
    expect(text).toContain(task.taskId)
    expect(text).toContain(task.spec.objective)
  })

  it('briefing_awaiting_review.mx contains handoff/report content', () => {
    const task = makeTaskForPhase('AWAITING_REVIEW')
    task.handoff = {
      type: 'report',
      data: {
        summary: 'Implemented feature X',
        filesChanged: ['src/foo.ts'],
      } as any,
    }
    const text = manager.render('briefing_awaiting_review.mx', { task })
    expect(text).toContain('REVIEWER')
    expect(text).toContain('post_approval')
    expect(text).toContain('post_rejection')
    expect(text).toContain('report')
  })

  it('briefing_awaiting_comments_resolution.mx contains rejection details', () => {
    const task = makeTaskForPhase('AWAITING_COMMENTS_RESOLUTION')
    task.handoff = {
      type: 'rejection',
      data: {
        feedback: 'Fix the memory leak',
        requiredChanges: ['Add proper cleanup'],
      } as any,
    }
    const text = manager.render('briefing_awaiting_comments_resolution.mx', { task })
    expect(text).toContain('ENGINEER')
    expect(text).toContain('post_comments_resolution')
  })

  it('briefing_completed.mx contains completed messaging', () => {
    const task = makeTaskForPhase('COMPLETED')
    const text = manager.render('briefing_completed.mx', { task })
    expect(text).toContain('COMPLETED')
    expect(text).toContain('Head Planner')
  })

  it('briefing_no_active_task.mx for null task', () => {
    const text = manager.render('briefing_no_active_task.mx', { task: null })
    expect(text).toContain('No active task')
    expect(text).toContain('Head Planner')
  })

  it('briefing_unknown_phase.mx contains phase and Head Planner', () => {
    const task = makeTaskForPhase('AWAITING_IMPLEMENTATION_REPORT')
    const taskWithUnknownPhase = { ...task, phase: 'UNKNOWN' as any }
    const text = manager.render('briefing_unknown_phase.mx', { task: taskWithUnknownPhase })
    expect(text).toContain('unrecognized phase')
    expect(text).toContain('UNKNOWN')
    expect(text).toContain('Head Planner')
  })
})
