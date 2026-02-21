import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { TemplateManager } from '../template-manager'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-test-'))
}

describe('TemplateManager', () => {
  let projectRoot: string
  let manager: TemplateManager

  beforeEach(() => {
    projectRoot = createTempProjectRoot()
    manager = new TemplateManager(DEFAULT_TEMPLATE_DIR)
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  describe('initialize', () => {
    it('creates .relay/templates in project root', () => {
      const templatesDir = path.join(projectRoot, '.relay', 'templates')
      expect(fs.existsSync(templatesDir)).toBe(false)
      manager.initialize(projectRoot)
      expect(fs.existsSync(templatesDir)).toBe(true)
    })
  })

  describe('render', () => {
    beforeEach(() => {
      manager.initialize(projectRoot)
    })

    it('renders planner_protocol.mx with empty context', () => {
      const text = manager.render('planner_protocol.mx', {})
      expect(text).toContain('Head Planner Protocol')
      expect(text).toContain('create_task')
      expect(text).toContain('await_engineer_update')
    })

    it('renders create_task.mx with featureId and taskId', () => {
      const text = manager.render('create_task.mx', {
        featureId: 'feat-1',
        taskId: 'task-a',
      })
      expect(text).toContain('feat-1')
      expect(text).toContain('task-a')
      expect(text).toContain('AWAITING_IMPLEMENTATION_REPORT')
    })

    it('renders template with json pipe', () => {
      const userDir = path.join(projectRoot, '.relay', 'templates')
      fs.writeFileSync(path.join(userDir, 'test_json.mx'), '{{ data | json }}')
      const result = manager.render('test_json.mx', { data: { foo: 'bar', count: 42 } })
      expect(() => JSON.parse(result)).not.toThrow()
      expect(JSON.parse(result)).toEqual({ foo: 'bar', count: 42 })
    })
  })

  describe('loadTemplate lazy eject', () => {
    beforeEach(() => {
      manager.initialize(projectRoot)
    })

    it('copies template from defaults to user dir on first render', () => {
      const userPath = path.join(projectRoot, '.relay', 'templates', 'reviewer_protocol.mx')
      expect(fs.existsSync(userPath)).toBe(false)
      manager.render('reviewer_protocol.mx', {})
      expect(fs.existsSync(userPath)).toBe(true)
      expect(fs.readFileSync(userPath, 'utf8')).toContain('Reviewer')
    })
  })

  describe('copyAllDefaultsToProject', () => {
    it('copies all .mx files when user dir is empty', () => {
      manager.copyAllDefaultsToProject(projectRoot)
      const userDir = path.join(projectRoot, '.relay', 'templates')
      const defaultFiles = fs.readdirSync(DEFAULT_TEMPLATE_DIR).filter(f => f.endsWith('.mx'))
      for (const f of defaultFiles) {
        expect(fs.existsSync(path.join(userDir, f))).toBe(true)
      }
    })

    it('does not overwrite existing user template', () => {
      const userDir = path.join(projectRoot, '.relay', 'templates')
      fs.mkdirSync(userDir, { recursive: true })
      const customContent = 'CUSTOM CONTENT OVERRIDE'
      fs.writeFileSync(path.join(userDir, 'planner_protocol.mx'), customContent)
      manager.copyAllDefaultsToProject(projectRoot)
      expect(fs.readFileSync(path.join(userDir, 'planner_protocol.mx'), 'utf8')).toBe(customContent)
    })
  })

  describe('render error handling', () => {
    beforeEach(() => {
      manager.initialize(projectRoot)
    })

    it('throws when default template does not exist', () => {
      expect(() => manager.render('nonexistent_template_xyz.mx', {})).toThrow(
        /Default template not found|not found/,
      )
    })

    it('throws when template has invalid Moxite syntax', () => {
      const userDir = path.join(projectRoot, '.relay', 'templates')
      fs.writeFileSync(path.join(userDir, 'bad_syntax.mx'), '{{ broken @if')
      expect(() => manager.render('bad_syntax.mx', {})).toThrow(/Failed to render|Failed to render bad_syntax/)
    })
  })
})
