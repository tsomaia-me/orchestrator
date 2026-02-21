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
    const loaded = persist.load()
    expect(loaded).toEqual(state)
  })

  it('load on missing file returns empty state', () => {
    const persist = new FilePersistence(path.join(tempDir, 'nonexistent', 'state.json'))
    const loaded = persist.load()
    expect(loaded).toEqual(createEmptyState())
  })

  it('load on invalid JSON returns empty state', () => {
    const statePath = path.join(tempDir, 'state.json')
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, 'not valid json', 'utf-8')
    const persist = new FilePersistence(statePath)
    const loaded = persist.load()
    expect(loaded).toEqual(createEmptyState())
  })

  it('load on empty file returns empty state', () => {
    const statePath = path.join(tempDir, 'state.json')
    fs.mkdirSync(path.dirname(statePath), { recursive: true })
    fs.writeFileSync(statePath, '', 'utf-8')
    const persist = new FilePersistence(statePath)
    const loaded = persist.load()
    expect(loaded).toEqual(createEmptyState())
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
    const loaded1 = new FilePersistence(path1).load()
    const loaded2 = new FilePersistence(path2).load()
    expect(loaded1.features[0].id).toBe('f1')
    expect(loaded2.features[0].id).toBe('f2')
  })
})
