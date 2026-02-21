import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  createEmptyState,
  initialize,
  getProjectRoot,
  resetInitialization,
} from '../helpers'
import { FilePersistence } from '../persistence/file-persistence'

const originalConsole = { log: console.log, warn: console.warn, error: console.error }

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'helpers-test-'))
}

describe('helpers', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    resetInitialization()
    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('createEmptyState', () => {
    it('returns valid empty state', () => {
      const state = createEmptyState()
      expect(state.features).toEqual([])
      expect(state.currentContext).toBeNull()
    })
  })

  describe('initialize and getProjectRoot', () => {
    it('initialize with projectRoot sets getProjectRoot', () => {
      const persist = new FilePersistence(path.join(tempDir, 'state.json'))
      initialize(tempDir, persist)
      expect(getProjectRoot()).toBe(path.resolve(tempDir))
    })

    it('initialize is idempotent; second call with same root is no-op', () => {
      const persist = new FilePersistence(path.join(tempDir, 'state.json'))
      initialize(tempDir, persist)
      const rootAfterFirst = getProjectRoot()
      initialize(tempDir, persist)
      expect(getProjectRoot()).toBe(rootAfterFirst)
    })

    it('initialize with different projectRoot on second call uses last root', () => {
      const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'helpers-test-2-'))
      try {
        const persist = new FilePersistence(path.join(tempDir, 'state.json'))
        initialize(tempDir, persist)
        initialize(tempDir2, persist)
        expect(getProjectRoot()).toBe(path.resolve(tempDir2))
      } finally {
        fs.rmSync(tempDir2, { recursive: true, force: true })
      }
    })
  })

  describe('resetInitialization', () => {
    it('clears init guard so getProjectRoot falls back to cwd', () => {
      const persist = new FilePersistence(path.join(tempDir, 'state.json'))
      initialize(tempDir, persist)
      expect(getProjectRoot()).toBe(path.resolve(tempDir))
      resetInitialization()
      const root = getProjectRoot()
      expect(root).toBe(process.cwd())
    })
  })
})
