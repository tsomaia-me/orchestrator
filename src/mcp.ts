import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ApprovalSchema,
  AwaitUpdateSchema,
  CreateTaskSchema,
  EngineerReportSchema,
  LoadProtocolSchema,
  RejectionSchema,
  SetActiveFeatureSchema,
} from './schema'
import { templateManager } from './template-manager'
import { createEmptyState, getProjectRoot, initialize } from './helpers'
import {
  REVIEWER_ACTIVE_PHASES,
  Approval,
  CreateTask,
  ENGINEER_ACTIVE_PHASES,
  EngineerReport,
  Handoff,
  LoadProtocol,
  Phase,
  Rejection,
  SetActiveFeature,
} from './types'
import { RelayStore } from './relay-store'
import { FilePersistence } from './persistence/file-persistence'
import { EventListener } from './event-listener'
import { handleAwait as handleAwaitCore, createDefaultWait } from './await-flow'
import { requireActiveTask, requirePhase } from './guards'
import { autoChainAwait as autoChainAwaitFn } from './auto-chain-await'

// ── Server setup ──────────────────────────────────────────────────

const server = new McpServer({ name: 'relay-orchestrator', version: '6.2.0' })

const persistence = new FilePersistence('.relay/state.json')
const store = new RelayStore({
  initialState: createEmptyState(),
  persistence,
})
const eventBus = new EventListener()

const AWAIT_TIMEOUT_MS = 60_000

// Per-role concurrency lock: prevents duplicate await calls from stacking
const awaitInFlight = new Map<string, boolean>()

const handleAwaitDeps = {
  store,
  eventBus,
  templateManager,
  getProjectRoot,
  waitForAnyEventWithTimeout: createDefaultWait(eventBus),
}

// ── Protocol loaders ──────────────────────────────────────────────

server.registerTool('load_planner_protocol', {
  description: [
    'Initializes the relay and returns the Planner protocol.',
    'Call this FIRST in the planner agent chat to set up the project.',
    'After loading, use `create_task` to populate the task queue.',
  ].join(' '),
  inputSchema: LoadProtocolSchema,
}, (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  templateManager.initialize(data.projectRoot)
  store.rehydrate()

  const text = templateManager.render('planner_protocol.mx', {})

  return {
    content: [{ type: 'text' as const, text }],
  }
})

server.registerTool('load_reviewer_protocol', {
  description: [
    'Initializes the relay and returns the Reviewer protocol.',
    'Call this FIRST in the reviewer agent chat.',
    'After loading, call `await_engineer_update` to receive your first task.',
  ].join(' '),
  inputSchema: LoadProtocolSchema,
}, (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  templateManager.initialize(data.projectRoot)
  store.rehydrate()

  const text = templateManager.render('reviewer_protocol.mx', {})

  return {
    content: [{ type: 'text' as const, text }],
  }
})

server.registerTool('load_engineer_protocol', {
  description: [
    'Initializes the relay and returns the Engineer protocol.',
    'Call this FIRST in the engineer agent chat.',
    'After loading, call `await_reviewer_update` to receive your first task spec.',
  ].join(' '),
  inputSchema: LoadProtocolSchema,
}, (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  templateManager.initialize(data.projectRoot)
  store.rehydrate()

  const text = templateManager.render('engineer_protocol.mx', {})

  return {
    content: [{ type: 'text' as const, text }],
  }
})

// ── Task management ───────────────────────────────────────────────

server.registerTool('create_task', {
  description: 'Creates a new task within a feature. The first task created auto-activates as the current task.',
  inputSchema: CreateTaskSchema,
}, (input: CreateTask) => {
  const { featureId, taskId, spec } = input
  console.log('create_task', featureId, taskId)

  store.addTask({
    featureId,
    taskId,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    spec,
    handoff: null,
  })

  templateManager.initialize(getProjectRoot())
  const text = templateManager.render('create_task.mx', { featureId, taskId })
  return {
    content: [{ type: 'text' as const, text }],
  }
})

server.registerTool('set_active_feature', {
  description: 'Sets the active feature. Activates the first non-completed task in the feature.',
  inputSchema: SetActiveFeatureSchema,
}, (data: SetActiveFeature) => {
  store.setActiveFeature(data.featureId)
  const task = store.getActiveTask()
  console.log('set_active_feature', data.featureId, task?.taskId)

  // Wake up any agents blocked on "no active task"
  if (task) {
    eventBus.trigger('set_active_task', task)
  }

  templateManager.initialize(getProjectRoot())
  const ctx = {
    featureId: data.featureId,
    taskId: task?.taskId ?? 'none',
    phase: task?.phase ?? 'unknown',
    task,
  }
  const text = templateManager.render('set_active_feature.mx', ctx)
  return {
    content: [{ type: 'text' as const, text }],
  }
})

// ── Await tools (role-specific) ───────────────────────────────────

server.registerTool('await_engineer_update', {
  description: [
    'REVIEWER ONLY. Call this to receive your next assignment or wait for the Engineer.',
    'Returns immediately if the current phase needs the Reviewer (AWAITING_REVIEW).',
    'Blocks up to 60 seconds if waiting for the Engineer to submit.',
  ].join(' '),
  inputSchema: AwaitUpdateSchema,
}, async () => {
  if (awaitInFlight.get('reviewer')) {
    templateManager.initialize(getProjectRoot())
    const text = templateManager.render('await_update.mx', {
      state: 'already_waiting',
      awaitToolName: 'await_engineer_update',
    })
    return { content: [{ type: 'text' as const, text }] }
  }
  awaitInFlight.set('reviewer', true)
  try {
    return await handleAwaitCore(REVIEWER_ACTIVE_PHASES, 'await_engineer_update', handleAwaitDeps, AWAIT_TIMEOUT_MS)
  } finally {
    awaitInFlight.set('reviewer', false)
  }
})

server.registerTool('await_reviewer_update', {
  description: [
    'ENGINEER ONLY. Call this to receive your next assignment or wait for the Reviewer.',
    'Returns immediately if the current phase needs the Engineer (AWAITING_IMPLEMENTATION_REPORT, AWAITING_COMMENTS_RESOLUTION).',
    'Blocks up to 60 seconds if waiting for the Reviewer to submit.',
  ].join(' '),
  inputSchema: AwaitUpdateSchema,
}, async () => {
  if (awaitInFlight.get('engineer')) {
    templateManager.initialize(getProjectRoot())
    const text = templateManager.render('await_update.mx', {
      state: 'already_waiting',
      awaitToolName: 'await_reviewer_update',
    })
    return { content: [{ type: 'text' as const, text }] }
  }
  awaitInFlight.set('engineer', true)
  try {
    return await handleAwaitCore(ENGINEER_ACTIVE_PHASES, 'await_reviewer_update', handleAwaitDeps, AWAIT_TIMEOUT_MS)
  } finally {
    awaitInFlight.set('engineer', false)
  }
})

// ── Action tools ──────────────────────────────────────────────────



server.registerTool('post_implementation_report', {
  description: [
    'ENGINEER ONLY. Submit your implementation report.',
    'Callable when phase is AWAITING_IMPLEMENTATION_REPORT.',
    'After submitting, automatically waits for the Reviewer\'s verdict and returns it.',
  ].join(' '),
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = requireActiveTask(store)
  requirePhase(task, 'AWAITING_IMPLEMENTATION_REPORT')

  console.log('post_implementation_report', task.featureId, task.taskId)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))

  eventBus.trigger(
    `${task.featureId}.${task.taskId}.post_implementation_report`,
    store.getActiveTask()!,
  )

  return autoChainAwait(
    'post_implementation_report.mx',
    { task },
    'engineer',
    ENGINEER_ACTIVE_PHASES,
    'await_reviewer_update',
  )
})

server.registerTool('post_comments_resolution', {
  description: [
    'ENGINEER ONLY. Submit your resolution addressing the Reviewer\'s rejection.',
    'Callable when phase is AWAITING_COMMENTS_RESOLUTION.',
    'After submitting, automatically waits for the Reviewer\'s re-review and returns it.',
  ].join(' '),
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = requireActiveTask(store)
  requirePhase(task, 'AWAITING_COMMENTS_RESOLUTION')

  console.log('post_comments_resolution', task.featureId, task.taskId)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))

  eventBus.trigger(
    `${task.featureId}.${task.taskId}.post_comments_resolution`,
    store.getActiveTask()!,
  )

  return autoChainAwait(
    'post_comments_resolution.mx',
    { task },
    'engineer',
    ENGINEER_ACTIVE_PHASES,
    'await_reviewer_update',
  )
})

server.registerTool('post_approval', {
  description: [
    'REVIEWER ONLY. Approve the Engineer\'s work.',
    'Only callable when phase is AWAITING_REVIEW.',
    'Marks the current task COMPLETED and advances to the next task if one exists.',
    'Automatically waits for the next assignment and returns it.',
  ].join(' '),
  inputSchema: ApprovalSchema,
}, async (data: Approval) => {
  const task = requireActiveTask(store)
  requirePhase(task, 'AWAITING_REVIEW')

  console.log('post_approval', task.featureId, task.taskId)

  // Store the approval handoff before advancing
  store.updateActiveTask(prev => ({
    ...prev,
    handoff: { type: 'approval', data },
  }))

  // Advance: marks current COMPLETED, switches to next task
  const nextTask = store.advanceToNextTask()

  eventBus.trigger(
    `${task.featureId}.${task.taskId}.post_approval`,
    { ...task, phase: 'COMPLETED' as const, handoff: { type: 'approval' as const, data } },
  )

  // Wake up agents for the next task immediately
  if (nextTask) {
    eventBus.trigger('set_active_task', nextTask)

    return autoChainAwait(
      'post_approval.mx',
      { task, nextTask },
      'reviewer',
      REVIEWER_ACTIVE_PHASES,
      'await_engineer_update',
    )
  }

  templateManager.initialize(getProjectRoot())
  const text = templateManager.render('post_approval.mx', {
    state: 'all_done',
    task,
  })
  return {
    content: [{ type: 'text' as const, text }],
  }
})

server.registerTool('post_rejection', {
  description: [
    'REVIEWER ONLY. Reject the Engineer\'s work with required fixes.',
    'Only callable when phase is AWAITING_REVIEW.',
    'After rejecting, automatically waits for the Engineer\'s resolution and returns it.',
  ].join(' '),
  inputSchema: RejectionSchema,
}, async (data: Rejection) => {
  const task = requireActiveTask(store)
  requirePhase(task, 'AWAITING_REVIEW')

  console.log('post_rejection', task.featureId, task.taskId)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_COMMENTS_RESOLUTION',
    handoff: { type: 'rejection', data },
  }))

  eventBus.trigger(
    `${task.featureId}.${task.taskId}.post_rejection`,
    store.getActiveTask()!,
  )

  return autoChainAwait(
    'post_rejection.mx',
    { task },
    'reviewer',
    REVIEWER_ACTIVE_PHASES,
    'await_engineer_update',
  )
})

// ── Shared helpers ────────────────────────────────────────────────

const autoChainAwaitDeps = {
  awaitInFlight,
  handleAwait: (activePhases: readonly Phase[], thisToolName: string) =>
    handleAwaitCore(activePhases, thisToolName, handleAwaitDeps, AWAIT_TIMEOUT_MS),
  templateManager,
  getProjectRoot,
  timeoutMs: AWAIT_TIMEOUT_MS,
}

function autoChainAwait(
  templateName: string,
  baseContext: Record<string, unknown>,
  role: 'reviewer' | 'engineer',
  activePhases: readonly Phase[],
  awaitToolName: string,
) {
  return autoChainAwaitFn(templateName, baseContext, role, activePhases, awaitToolName, autoChainAwaitDeps)
}

// ── Start ─────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
server.connect(transport).then(() => {
  console.log('Relay MCP Server running (v6.2.0)')
}).catch(err => {
  console.error('Failed to start Relay MCP Server', err)
  process.exit(1)
})
