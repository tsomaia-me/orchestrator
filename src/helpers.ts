import path from 'path'
import fs from 'fs'
import { Phase, RelayState } from './types'
import { FilePersistence } from './persistence/file-persistence'

// ── Idempotent initialization ─────────────────────────────────────

let initialized = false

/**
 * Initialize the relay working directory and persistence layer.
 * Idempotent — safe to call multiple times, only runs once.
 *
 * Resolution: explicit projectRoot > RELAY_ROOT env > process.cwd()
 */
export function initialize(projectRoot: string, persistence: FilePersistence): void {
  if (initialized) return

  const resolvedRoot = projectRoot
    || process.env.RELAY_ROOT
    || process.cwd()

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
  console.error = (...args) => log('ERROR', args)

  persistence.setFilePath(path.resolve(relayPath, 'state.json'))

  console.log('Relay initialized', { projectRoot: resolvedRoot, relayPath })

  initialized = true
}

/** Reset init guard — for testing only */
export function resetInitialization(): void {
  initialized = false
}

// ── State factory ─────────────────────────────────────────────────

export function createEmptyState(): RelayState {
  return {
    features: [],
    currentContext: null,
  }
}

// ── Phase instructions ────────────────────────────────────────────

export function getPhaseDirective(phase: Phase): string {
  switch (phase) {
    case 'AWAITING_DIRECTIVE':
      return [
        'You are the ARCHITECT.',
        'Analyze the task spec and design a technical blueprint.',
        'Submit your blueprint via `post_directive`.',
        'Then call `await_engineer_update` to wait for the Engineer\'s implementation report.',
      ].join(' ')

    case 'AWAITING_IMPLEMENTATION_REPORT':
      return [
        'You are the ENGINEER.',
        'Read the Architect\'s directive in the handoff.',
        'Implement the requested changes, verify your work with build/test commands.',
        'Submit your report via `post_implementation_report`.',
        'Then call `await_architect_update` to wait for the Architect\'s review.',
      ].join(' ')

    case 'AWAITING_REVIEW':
      return [
        'You are the ARCHITECT.',
        'Review the Engineer\'s report in the handoff.',
        'Verify their claims and check code quality.',
        'Approve via `post_approval` or reject via `post_rejection`.',
        'After submitting, call `await_engineer_update` if more tasks remain.',
      ].join(' ')

    case 'AWAITING_COMMENTS_RESOLUTION':
      return [
        'You are the ENGINEER.',
        'Your previous implementation was REJECTED.',
        'Read the rejection feedback in the handoff, implement the required fixes.',
        'Submit your resolution via `post_comments_resolution`.',
        'Then call `await_architect_update` to wait for re-review.',
      ].join(' ')

    case 'COMPLETED':
      return 'This task is COMPLETED. No further action required. Call the await tool to pick up the next task if one exists.'

    default:
      return 'Unknown phase. Call the await tool to get the current state.'
  }
}
