import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TemplateManager } from '../../template-manager'
import { makeTask } from '../fixtures/task-states'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
}

describe('Tool templates', () => {
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

  describe('await_update.mx', () => {
    it('renders already_waiting branch', () => {
      const text = manager.render('await_update.mx', {
        state: 'already_waiting',
        awaitToolName: 'await_engineer_update',
      })
      expect(text).toContain('ALREADY WAITING')
      expect(text).toContain('await_engineer_update')
    })

    it('renders no_active_task branch', () => {
      const text = manager.render('await_update.mx', {
        state: 'no_active_task',
        thisToolName: 'await_reviewer_update',
      })
      expect(text).toContain('No active task yet')
      expect(text).toContain('create_task')
      expect(text).toContain('await_reviewer_update')
    })

    it('renders waiting_for_other branch', () => {
      const text = manager.render('await_update.mx', {
        state: 'waiting_for_other',
        phase: 'AWAITING_IMPLEMENTATION_REPORT',
        thisToolName: 'await_engineer_update',
      })
      expect(text).toContain('The other agent hasn\'t submitted yet')
      expect(text).toContain('AWAITING_IMPLEMENTATION_REPORT')
    })
  })

  describe('create_task.mx', () => {
    it('renders with featureId and taskId', () => {
      const text = manager.render('create_task.mx', {
        featureId: 'feat-x',
        taskId: 'task-1',
      })
      expect(text).toContain('feat-x')
      expect(text).toContain('task-1')
      expect(text).toContain('AWAITING_IMPLEMENTATION_REPORT')
    })
  })

  describe('set_active_feature.mx', () => {
    it('renders with featureId, taskId, phase', () => {
      const task = makeTask({ phase: 'AWAITING_REVIEW' })
      const text = manager.render('set_active_feature.mx', {
        featureId: 'feat-y',
        taskId: 'task-2',
        phase: 'AWAITING_REVIEW',
        task,
      })
      expect(text).toContain('feat-y')
      expect(text).toContain('task-2')
      expect(text).toContain('AWAITING_REVIEW')
    })
  })

  describe('post_implementation_report.mx', () => {
    const task = makeTask({ phase: 'AWAITING_REVIEW' })

    it('renders already_waiting branch', () => {
      const text = manager.render('post_implementation_report.mx', {
        state: 'already_waiting',
        task,
        awaitToolName: 'await_reviewer_update',
      })
      expect(text).toContain('Report submitted')
      expect(text).toContain('ALREADY WAITING')
    })

    it('renders timeout branch', () => {
      const text = manager.render('post_implementation_report.mx', {
        state: 'timeout',
        task,
        awaitToolName: 'await_reviewer_update',
      })
      expect(text).toContain('Report submitted')
      expect(text).toContain('The other agent hasn\'t submitted yet')
    })

    it('renders success branch with briefingText', () => {
      const text = manager.render('post_implementation_report.mx', {
        task,
        briefingText: 'Your next assignment...',
      })
      expect(text).toContain('Report submitted')
      expect(text).toContain('Your next assignment...')
    })
  })

  describe('post_comments_resolution.mx', () => {
    const task = makeTask({ phase: 'AWAITING_COMMENTS_RESOLUTION' })

    it('renders already_waiting branch', () => {
      const text = manager.render('post_comments_resolution.mx', {
        state: 'already_waiting',
        task,
        awaitToolName: 'await_reviewer_update',
      })
      expect(text).toContain('Resolution submitted')
      expect(text).toContain('ALREADY WAITING')
    })

    it('renders timeout branch', () => {
      const text = manager.render('post_comments_resolution.mx', {
        state: 'timeout',
        task,
        awaitToolName: 'await_reviewer_update',
      })
      expect(text).toContain('Resolution submitted')
      expect(text).toContain('The other agent hasn\'t submitted yet')
    })

    it('renders success branch', () => {
      const text = manager.render('post_comments_resolution.mx', {
        task,
        briefingText: 'Reviewer verdict...',
      })
      expect(text).toContain('Resolution submitted')
      expect(text).toContain('Reviewer verdict...')
    })
  })

  describe('post_rejection.mx', () => {
    const task = makeTask({ phase: 'AWAITING_COMMENTS_RESOLUTION' })

    it('renders already_waiting branch', () => {
      const text = manager.render('post_rejection.mx', {
        state: 'already_waiting',
        task,
        awaitToolName: 'await_engineer_update',
      })
      expect(text).toContain('REJECTED')
      expect(text).toContain('ALREADY WAITING')
    })

    it('renders timeout branch', () => {
      const text = manager.render('post_rejection.mx', {
        state: 'timeout',
        task,
        awaitToolName: 'await_engineer_update',
      })
      expect(text).toContain('REJECTED')
      expect(text).toContain('The other agent hasn\'t submitted yet')
    })

    it('renders success branch', () => {
      const text = manager.render('post_rejection.mx', {
        task,
        briefingText: 'Engineer resolution...',
      })
      expect(text).toContain('REJECTED')
      expect(text).toContain('Engineer resolution...')
    })
  })

  describe('post_approval.mx', () => {
    const task = makeTask({ phase: 'COMPLETED' })
    const nextTask = makeTask({ taskId: 'task-b', phase: 'AWAITING_IMPLEMENTATION_REPORT' })

    it('renders all_done branch', () => {
      const text = manager.render('post_approval.mx', {
        state: 'all_done',
        task,
      })
      expect(text).toContain('APPROVED')
      expect(text).toContain('All done')
    })

    it('renders already_waiting branch', () => {
      const text = manager.render('post_approval.mx', {
        state: 'already_waiting',
        task,
        nextTask,
        awaitToolName: 'await_engineer_update',
      })
      expect(text).toContain('APPROVED')
      expect(text).toContain('task-b')
      expect(text).toContain('ALREADY WAITING')
    })

    it('renders timeout branch', () => {
      const text = manager.render('post_approval.mx', {
        state: 'timeout',
        task,
        nextTask,
        awaitToolName: 'await_engineer_update',
      })
      expect(text).toContain('APPROVED')
      expect(text).toContain('task-b')
      expect(text).toContain('The other agent hasn\'t submitted yet')
    })

    it('renders success branch', () => {
      const text = manager.render('post_approval.mx', {
        task,
        nextTask,
        briefingText: 'Next task briefing...',
      })
      expect(text).toContain('APPROVED')
      expect(text).toContain('task-b')
      expect(text).toContain('Next task briefing...')
    })
  })
})
