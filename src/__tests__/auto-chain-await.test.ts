import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { autoChainAwait } from '../auto-chain-await'
import { TemplateManager } from '../template-manager'
import { makeTask } from './fixtures/task-states'

const DEFAULT_TEMPLATE_DIR = path.join(process.cwd(), 'src', 'templates')

function createTempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'relay-auto-chain-test-'))
}

describe('autoChainAwait', () => {
  let projectRoot: string
  let templateManager: TemplateManager
  let awaitInFlight: Map<string, boolean>

  beforeEach(() => {
    projectRoot = createTempProjectRoot()
    templateManager = new TemplateManager(DEFAULT_TEMPLATE_DIR)
    templateManager.initialize(projectRoot)
    awaitInFlight = new Map()
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  const getProjectRoot = () => projectRoot

  it('when awaitInFlight.get(role) true, renders with state already_waiting', async () => {
    awaitInFlight.set('engineer', true)
    const handleAwait = () => Promise.resolve({ content: [{ type: 'text' as const, text: 'never used' }] })
    const deps = {
      awaitInFlight,
      handleAwait,
      templateManager,
      getProjectRoot,
      timeoutMs: 1000,
    }
    const result = await autoChainAwait(
      'post_implementation_report.mx',
      { task: makeTask() },
      'engineer',
      ['AWAITING_REVIEW'],
      'await_reviewer_update',
      deps,
    )
    expect(result.content[0].text).toContain('ALREADY WAITING')
  })

  it('when handleAwait returns text with "⏳ WAITING:", renders with state timeout', async () => {
    const handleAwait = () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: '⏳ WAITING: No active task yet.' }],
      })
    const deps = {
      awaitInFlight,
      handleAwait,
      templateManager,
      getProjectRoot,
      timeoutMs: 1000,
    }
    const result = await autoChainAwait(
      'post_implementation_report.mx',
      { task: makeTask() },
      'engineer',
      ['AWAITING_REVIEW'],
      'await_reviewer_update',
      deps,
    )
    expect(result.content[0].text).toContain('Report submitted')
    expect(result.content[0].text).toContain('The other agent hasn\'t submitted yet')
  })

  it('when handleAwait returns success, renders with state success and briefingText', async () => {
    const briefingText = 'Your next assignment: Review the code.'
    const handleAwait = () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: briefingText }],
      })
    const deps = {
      awaitInFlight,
      handleAwait,
      templateManager,
      getProjectRoot,
      timeoutMs: 1000,
    }
    const result = await autoChainAwait(
      'post_implementation_report.mx',
      { task: makeTask() },
      'engineer',
      ['AWAITING_REVIEW'],
      'await_reviewer_update',
      deps,
    )
    expect(result.content[0].text).toContain(briefingText)
  })

  it('finally always clears awaitInFlight', async () => {
    const handleAwait = () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'success' }],
      })
    const deps = {
      awaitInFlight,
      handleAwait,
      templateManager,
      getProjectRoot,
      timeoutMs: 1000,
    }
    await autoChainAwait(
      'post_implementation_report.mx',
      { task: makeTask() },
      'engineer',
      [],
      'await_reviewer_update',
      deps,
    )
    expect(awaitInFlight.get('engineer')).toBe(false)
  })

  it('when handleAwait throws, awaitInFlight still cleared', async () => {
    const handleAwait = () => Promise.reject(new Error('Simulated failure'))
    const deps = {
      awaitInFlight,
      handleAwait,
      templateManager,
      getProjectRoot,
      timeoutMs: 1000,
    }
    await expect(
      autoChainAwait(
        'post_implementation_report.mx',
        { task: makeTask() },
        'engineer',
        [],
        'await_reviewer_update',
        deps,
      ),
    ).rejects.toThrow('Simulated failure')
    expect(awaitInFlight.get('engineer')).toBe(false)
  })
})
