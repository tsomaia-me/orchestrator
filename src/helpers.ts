import path from 'path'
import fs from 'fs'
import { Phase, RelayState } from './types'
import { FilePersistence } from './persistence/file-persistence'

// ── Idempotent initialization ─────────────────────────────────────

let initialized = false
let initializedRoot: string | null = null

/**
 * Initialize the relay working directory and persistence layer.
 * Idempotent for same root; last-wins when different projectRoot is passed.
 *
 * Resolution: explicit projectRoot > RELAY_ROOT env > process.cwd()
 */
export function initialize(projectRoot: string, persistence: FilePersistence): void {
  const resolvedRoot = path.resolve(
    projectRoot || process.env.RELAY_ROOT || process.cwd(),
  )

  if (initialized && initializedRoot === resolvedRoot) {
    return
  }

  const relayPath = path.resolve(resolvedRoot, '.relay')
  const logFile = path.resolve(relayPath, 'debug.log')

  fs.mkdirSync(relayPath, { recursive: true })

  // File-append logger — never truncates existing logs
  const log = (level: string, args: unknown[]) => {
    const timestamp = new Date().toISOString()
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    fs.appendFileSync(logFile, `[${timestamp}] ${level} ${message}\n`)
  }

  console.log = (...args) => log('INFO', args)
  console.warn = (...args) => log('WARN', args)
  console.error = (...args) => log('ERROR', args)

  persistence.setFilePath(path.resolve(relayPath, 'state.json'))

  console.log('Relay initialized', { projectRoot: resolvedRoot, relayPath })

  initialized = true
  initializedRoot = resolvedRoot
}

/** Reset init guard — for testing only */
export function resetInitialization(): void {
  initialized = false
  initializedRoot = null
}

/** Returns the project root used for relay operations. Use for template manager when tools don't receive projectRoot. */
export function getProjectRoot(): string {
  return initializedRoot || process.env.RELAY_ROOT || process.cwd()
}

// ── State factory ─────────────────────────────────────────────────

export function createEmptyState(): RelayState {
  return {
    features: [],
    currentContext: null,
  }
}

