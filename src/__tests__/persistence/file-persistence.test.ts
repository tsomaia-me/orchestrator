import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FilePersistence } from '../../persistence/file-persistence'
import { createEmptyState } from '../../helpers'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'file-persistence-test-'))
}

describe('FilePersistence', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('save then load returns same state', () => {
    const statePath = path.join(tempDir, 'state.json')
    const persist = new FilePersistence(statePath)
    const state = {
      features: [{ id: 'f1', tasks: [{
        featureId: 'f1',
        taskId: 't1',
        phase: 'AWAITING_IMPLEMENTATION_REPORT' as const,
        spec: { objective: 'x', requirements: [], constraints: [] },
        handoff: null,
      }] }],
      currentContext: { featureId: 'f1', taskId: 't1' },
    }
    persist.save(state)
    const result = persist.load()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toEqual(state)
  })

  it('load on missing file returns error', () => {
    const persist = new FilePersistence(path.join(tempDir, 'nonexistent', 'state.json'))
    const result = persist.load()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeDefined()
      expect(result.error.message).toBeDefined()
    }
  })

  it('load on invalid JSON returns error', () => {
    const statePath = path.join(tempDir, 'state.json')
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, 'not valid json', 'utf-8')
    const persist = new FilePersistence(statePath)
    const result = persist.load()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeDefined()
      expect(result.error.message).toBeDefined()
    }
  })

  it('load on empty file returns error', () => {
    const statePath = path.join(tempDir, 'state.json')
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, '', 'utf-8')
    const persist = new FilePersistence(statePath)
    const result = persist.load()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeDefined()
      expect(result.error.message).toBeDefined()
    }
  })

  it('save uses atomic rename - writes to tmp then renames', () => {
    const statePath = path.join(tempDir, 'state.json')
    const persist = new FilePersistence(statePath)
    const state = createEmptyState()
    persist.save(state)
    expect(fs.existsSync(statePath)).toBe(true)
    expect(fs.existsSync(statePath + '.tmp')).toBe(false)
    const content = fs.readFileSync(statePath, 'utf-8')
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('setFilePath changes target of save and load', () => {
    const path1 = path.join(tempDir, 'state1.json')
    const path2 = path.join(tempDir, 'state2.json')
    const persist = new FilePersistence(path1)
    persist.save({
      features: [{ id: 'f1', tasks: [] }],
      currentContext: null,
    })
    persist.setFilePath(path2)
    persist.save({
      features: [{ id: 'f2', tasks: [] }],
      currentContext: null,
    })
    const result1 = new FilePersistence(path1).load()
    const result2 = new FilePersistence(path2).load()
    expect(result1.ok).toBe(true)
    expect(result2.ok).toBe(true)
    if (result1.ok) expect(result1.state.features[0].id).toBe('f1')
    if (result2.ok) expect(result2.state.features[0].id).toBe('f2')
  })
})
