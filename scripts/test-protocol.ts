/**
 * Integration test: simulates the full Architect ↔ Engineer protocol
 * using the RelayStore and EventListener directly (no MCP transport).
 *
 * Run: npx tsx scripts/test-protocol.ts
 */

import { RelayStore } from '../src/relay-store'
import { EventListener } from '../src/event-listener'
import { createEmptyState } from '../src/helpers'
import { ARCHITECT_ACTIVE_PHASES, ENGINEER_ACTIVE_PHASES, Phase, TaskState } from '../src/types'
import { FilePersistence } from '../src/persistence/file-persistence'
import fs from 'fs'
import path from 'path'

// ── Test helpers ──────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++
        console.log(`  ✅ ${message}`)
    } else {
        failed++
        console.error(`  ❌ FAIL: ${message}`)
    }
}

function assertThrows(fn: () => void, message: string): void {
    try {
        fn()
        failed++
        console.error(`  ❌ FAIL (expected throw): ${message}`)
    } catch {
        passed++
        console.log(`  ✅ ${message}`)
    }
}

// ── Setup ─────────────────────────────────────────────────────────

const TEST_DIR = path.resolve('/tmp/relay-test-' + Date.now())
const STATE_FILE = path.join(TEST_DIR, 'state.json')

fs.mkdirSync(TEST_DIR, { recursive: true })

const persistence = new FilePersistence(STATE_FILE)
const store = new RelayStore({ initialState: createEmptyState(), persistence })
const eventBus = new EventListener()

// ── Test 1: Task creation and auto-activate ───────────────────────

console.log('\n📋 Test 1: Task creation')

store.addTask({
    featureId: 'auth',
    taskId: 'jwt-setup',
    phase: 'AWAITING_DIRECTIVE',
    spec: { objective: 'Set up JWT', requirements: ['Sign tokens'], constraints: ['Use RS256'] },
    handoff: null,
})

store.addTask({
    featureId: 'auth',
    taskId: 'login-api',
    phase: 'AWAITING_DIRECTIVE',
    spec: { objective: 'Build login API', requirements: ['POST /login'], constraints: ['Use Express'] },
    handoff: null,
})

let activeTask = store.getActiveTask()
assert(activeTask !== null, 'Active task exists after creation')
assert(activeTask!.taskId === 'jwt-setup', 'First task auto-activated')
assert(activeTask!.phase === 'AWAITING_DIRECTIVE', 'Initial phase is AWAITING_DIRECTIVE')

// ── Test 2: Phase constants ───────────────────────────────────────

console.log('\n📋 Test 2: Role-phase mapping')

assert(ARCHITECT_ACTIVE_PHASES.includes('AWAITING_DIRECTIVE'), 'Architect active for AWAITING_DIRECTIVE')
assert(ARCHITECT_ACTIVE_PHASES.includes('AWAITING_REVIEW'), 'Architect active for AWAITING_REVIEW')
assert(!ARCHITECT_ACTIVE_PHASES.includes('AWAITING_IMPLEMENTATION_REPORT'), 'Architect NOT active for AWAITING_IMPLEMENTATION_REPORT')

assert(ENGINEER_ACTIVE_PHASES.includes('AWAITING_IMPLEMENTATION_REPORT'), 'Engineer active for AWAITING_IMPLEMENTATION_REPORT')
assert(ENGINEER_ACTIVE_PHASES.includes('AWAITING_COMMENTS_RESOLUTION'), 'Engineer active for AWAITING_COMMENTS_RESOLUTION')
assert(!ENGINEER_ACTIVE_PHASES.includes('AWAITING_DIRECTIVE'), 'Engineer NOT active for AWAITING_DIRECTIVE')

// ── Test 3: Architect posts directive ─────────────────────────────

console.log('\n📋 Test 3: post_directive')

store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    handoff: {
        type: 'directive',
        data: {
            blueprint: 'Create JWT utils',
            files_to_touch: ['src/jwt.ts'],
            technical_constraints: ['Use RS256'],
        },
    },
}))

activeTask = store.getActiveTask()!
assert(activeTask.phase === 'AWAITING_IMPLEMENTATION_REPORT', 'Phase transitioned to AWAITING_IMPLEMENTATION_REPORT')
assert(activeTask.handoff?.type === 'directive', 'Handoff contains directive')

// ── Test 4: Engineer posts report ─────────────────────────────────

console.log('\n📋 Test 4: post_implementation_report')

store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: {
        type: 'report',
        data: {
            files_modified: ['src/jwt.ts'],
            self_review_status: 'manually_reviewed_and_confirmed',
            checks: [{ checkId: 'build', status: 'passed', command: 'npm run build', relative_path: '.' }],
            coverage_status: 'new_functionality_fully_covered',
            implementation_status: 'fully_implemented',
            implementation_notes: 'Implemented JWT signing with RS256',
            responsibility_ownership: 'I_the_engineer_am_responsible',
        },
    },
}))

activeTask = store.getActiveTask()!
assert(activeTask.phase === 'AWAITING_REVIEW', 'Phase transitioned to AWAITING_REVIEW')
assert(activeTask.handoff?.type === 'report', 'Handoff contains report')

// ── Test 5: Architect approves → task advances ────────────────────

console.log('\n📋 Test 5: post_approval and task advancement')

// Store approval handoff
store.updateActiveTask(prev => ({
    ...prev,
    handoff: {
        type: 'approval',
        data: {
            decision: 'approved' as const,
            manual_review_confirmation: 'manually_reviewed_each_file_and_line',
            strictness_enforcement_confirmation: 'zero_tolerance_enforced_no_minor_issues_found',
            review_summary: 'JWT implementation is correct with RS256 signing.',
            truth_check_verification: 'verified_all_engineer_commands_passed',
            verification_critique: 'Build check is sufficient for this task.',
            constraint_compliance: 'all_technical_constraints_strictly_met',
            constraint_justification: 'RS256 is used throughout as required.',
            responsibility_ownership: 'I_the_architect_am_responsible_for_quality',
        },
    },
}))

// Advance to next task
const nextTask = store.advanceToNextTask()

assert(nextTask !== null, 'Next task exists')
assert(nextTask!.taskId === 'login-api', 'Advanced to login-api task')
assert(nextTask!.phase === 'AWAITING_DIRECTIVE', 'Next task starts at AWAITING_DIRECTIVE')

// Verify current task switched
activeTask = store.getActiveTask()!
assert(activeTask.taskId === 'login-api', 'Active task is now login-api')

// Verify old task is completed
const completedTask = store.getTask('auth', 'jwt-setup')
assert(completedTask.phase === 'COMPLETED', 'Previous task marked COMPLETED')

// ── Test 6: getNextTask skips current ─────────────────────────────

console.log('\n📋 Test 6: getNextTask correctness')

// Currently on login-api, which is the last task
const noNext = store.getNextTask()
assert(noNext === null, 'getNextTask returns null when no more tasks')

// ── Test 7: Rejection flow ────────────────────────────────────────

console.log('\n📋 Test 7: Rejection flow')

// Architect directs
store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    handoff: { type: 'directive', data: { blueprint: 'Build login', files_to_touch: ['src/login.ts'], technical_constraints: [] } },
}))

// Engineer submits
store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: {
        type: 'report',
        data: {
            files_modified: ['src/login.ts'],
            self_review_status: 'manually_reviewed_and_confirmed',
            checks: [],
            coverage_status: 'new_functionality_fully_covered',
            implementation_status: 'fully_implemented',
            implementation_notes: 'Built login endpoint',
            responsibility_ownership: 'I_the_engineer_am_responsible',
        },
    },
}))

// Architect rejects
store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_COMMENTS_RESOLUTION',
    handoff: {
        type: 'rejection',
        data: {
            decision: 'rejected' as const,
            rejection_reason: 'Missing input validation',
            required_fixes: ['Add email format validation'],
        },
    },
}))

activeTask = store.getActiveTask()!
assert(activeTask.phase === 'AWAITING_COMMENTS_RESOLUTION', 'Phase is AWAITING_COMMENTS_RESOLUTION after rejection')
assert(activeTask.handoff?.type === 'rejection', 'Handoff contains rejection')

// Engineer resolves
store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: {
        type: 'report',
        data: {
            files_modified: ['src/login.ts'],
            self_review_status: 'manually_reviewed_and_confirmed',
            checks: [{ checkId: 'test', status: 'passed', command: 'npm test', relative_path: '.' }],
            coverage_status: 'new_functionality_fully_covered',
            implementation_status: 'fully_implemented',
            implementation_notes: 'Added email validation as requested',
            responsibility_ownership: 'I_the_engineer_am_responsible',
        },
    },
}))

activeTask = store.getActiveTask()!
assert(activeTask.phase === 'AWAITING_REVIEW', 'Phase returned to AWAITING_REVIEW after resolution')

// ── Test 8: Persistence and rehydration ───────────────────────────

console.log('\n📋 Test 8: Persistence and rehydration')

// State should already be on disk from all the mutations
assert(fs.existsSync(STATE_FILE), 'State file exists on disk')

// Create a fresh store and rehydrate
const store2 = new RelayStore({ persistence: new FilePersistence(STATE_FILE) })
store2.rehydrate()

const rehydratedTask = store2.getActiveTask()
assert(rehydratedTask !== null, 'Rehydrated store has active task')
assert(rehydratedTask!.taskId === 'login-api', 'Rehydrated active task is login-api')
assert(rehydratedTask!.phase === 'AWAITING_REVIEW', 'Rehydrated phase is correct')

const rehydratedCompleted = store2.getTask('auth', 'jwt-setup')
assert(rehydratedCompleted.phase === 'COMPLETED', 'Rehydrated completed task still COMPLETED')

// ── Test 9: Event listener ────────────────────────────────────────

// Wrap async tests in an IIFE to avoid top-level await in CJS
async function runAsyncTests() {
    const task = store.getActiveTask()!

    console.log('\n📋 Test 9: Event listener')

    let eventFired = false
    eventBus.on('set_active_task', () => { eventFired = true })
    eventBus.trigger('set_active_task', task)
    assert(eventFired, 'Event listener fires on trigger')

    // One-shot listen
    let listenResolved = false
    const listenPromise = eventBus.listen('auth.login-api.post_directive').then(t => {
        listenResolved = true
        return t
    })
    eventBus.trigger('auth.login-api.post_directive', task)
    await listenPromise
    assert(listenResolved, 'One-shot listen resolves on trigger')

    // After one-shot, listener should be removed (no double-fire)
    let doubleFireCount = 0
    eventBus.on('auth.login-api.post_approval', () => { doubleFireCount++ })
    const listen2 = eventBus.listen('auth.login-api.post_approval')
    eventBus.trigger('auth.login-api.post_approval', task)
    await listen2
    eventBus.trigger('auth.login-api.post_approval', task)
    assert(doubleFireCount === 2, 'Regular listener persists, one-shot auto-removed')

    // ── Test 10: Phase guards ───────────────────────────────────────

    console.log('\n📋 Test 10: Phase guards')

    // Currently AWAITING_REVIEW — can't post directive (requires AWAITING_DIRECTIVE)
    assertThrows(
        () => {
            const t = store.getActiveTask()!
            if (t.phase !== 'AWAITING_DIRECTIVE') throw new Error('Phase mismatch')
        },
        'Phase guard rejects wrong phase'
    )
}

runAsyncTests().then(() => {
    // ── Cleanup & summary ───────────────────────────────────────────

    fs.rmSync(TEST_DIR, { recursive: true, force: true })

    console.log(`\n${'═'.repeat(50)}`)
    console.log(`Results: ${passed} passed, ${failed} failed`)
    console.log('═'.repeat(50))

    if (failed > 0) {
        process.exit(1)
    }
}).catch(err => {
    console.error('Test runner error:', err)
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
    process.exit(1)
})
