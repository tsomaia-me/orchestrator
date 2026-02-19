import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ApprovalSchema,
  AwaitUpdateSchema,
  CreateTaskSchema,
  DirectiveSchema,
  EngineerReportSchema,
  LoadProtocolSchema,
  RejectionSchema,
  SetActiveFeatureSchema,
} from './schema'
import { createEmptyState, getPhaseDirective, initialize } from './helpers'
import {
  REVIEWER_ACTIVE_PHASES,
  Approval,
  Briefing,
  CreateTask,
  Directive,
  ENGINEER_ACTIVE_PHASES,
  EngineerReport,
  Handoff,
  LoadProtocol,
  Phase,
  Rejection,
  SetActiveFeature,
  TaskEventListener,
  TaskEventName,
  TaskState,
} from './types'
import { RelayStore } from './relay-store'
import { FilePersistence } from './persistence/file-persistence'
import { EventListener } from './event-listener'

// ── Server setup ──────────────────────────────────────────────────

const server = new McpServer({ name: 'relay-orchestrator', version: '6.0.0' })

const persistence = new FilePersistence('.relay/state.json')
const store = new RelayStore({
  initialState: createEmptyState(),
  persistence,
})
const eventBus = new EventListener()

const AWAIT_TIMEOUT_MS = 30_000

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
  store.rehydrate()

  return {
    content: [{
      type: 'text' as const,
      text: `## Head Planner Protocol
1. **Scope**: Analyze the user's high-level feature request. Identify dependencies and the "Definition of Done."
2. **Decompose**: Break the feature into small, atomic, sequential tasks (e.g., \`db-setup\` -> \`auth-api\` -> \`login-ui\`).
3. **Validate**: Present the proposed list of \`taskId\`s and \`objectives\` to the user. **STOP and wait for manual approval.**
4. **Execute**: Only after user confirmation, call \`create_task\` for every item in the plan.
5. **Handoff**: Once all tasks are created, the Reviewer and Engineer agents can begin. The Reviewer should call \`await_engineer_update\` and the Engineer should call \`await_reviewer_update\`.`,
    }],
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
  store.rehydrate()

  return {
    content: [{
      type: 'text' as const,
      text: `## Reviewer Protocol

You are the REVIEWER. Your tools are: \`await_engineer_update\`, \`post_directive\`, \`post_approval\`, \`post_rejection\`.

### Workflow
1. **Start**: Call \`await_engineer_update\` to receive the current task spec or the Engineer's latest report.
2. **Design** (if AWAITING_DIRECTIVE): Analyze the spec, create a technical blueprint with file paths and logic.
3. **Submit**: Call \`post_directive\` with your blueprint, then call \`await_engineer_update\` to wait for the Engineer.
4. **Review** (if AWAITING_REVIEW): Verify the Engineer's report meets all constraints.
5. **Decide**: Call \`post_approval\` if satisfactory, or \`post_rejection\` with required fixes.
6. **Loop**: After approval/rejection, call \`await_engineer_update\` to continue with the next task or iteration.

### Rules
- NEVER call \`await_reviewer_update\` — that is the Engineer's tool.
- ALWAYS call \`await_engineer_update\` after submitting a directive, approval, or rejection.
- Review with zero-trust: verify every claim the Engineer makes.`,
    }],
  }
})

server.registerTool('load_engineer_protocol', {
  description: [
    'Initializes the relay and returns the Engineer protocol.',
    'Call this FIRST in the engineer agent chat.',
    'After loading, call `await_reviewer_update` to receive your first directive.',
  ].join(' '),
  inputSchema: LoadProtocolSchema,
}, (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  store.rehydrate()

  return {
    content: [{
      type: 'text' as const,
      text: `## Engineer Protocol

You are the ENGINEER. Your tools are: \`await_reviewer_update\`, \`post_implementation_report\`, \`post_comments_resolution\`.

### Workflow
1. **Start**: Call \`await_reviewer_update\` to receive the Reviewer's directive.
2. **Implement**: Code the changes exactly as specified in the directive.
3. **Verify**: Run build, tests, and linting locally. Record the exact commands you ran.
4. **Submit**: Call \`post_implementation_report\` with your changes and verification results.
5. **Wait**: Call \`await_reviewer_update\` to receive the review outcome.
6. **If rejected**: Read the required fixes, implement them, then call \`post_comments_resolution\`.
7. **Loop**: After submitting, always call \`await_reviewer_update\` for the next step.

### Rules
- NEVER call \`await_engineer_update\` — that is the Reviewer's tool.
- ALWAYS call \`await_reviewer_update\` after submitting a report or resolution.
- You MUST provide the exact shell commands you ran in your report.
- Take responsibility for the quality of your code.`,
    }],
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
    phase: 'AWAITING_DIRECTIVE',
    spec,
    handoff: null,
  })

  return {
    content: [{
      type: 'text' as const,
      text: `Task created: ${featureId}/${taskId}. Phase: AWAITING_DIRECTIVE.`,
    }],
  }
})

server.registerTool('set_active_feature', {
  description: 'Sets the active feature. Activates the first non-completed task in the feature.',
  inputSchema: SetActiveFeatureSchema,
}, (data: SetActiveFeature) => {
  store.setActiveFeature(data.featureId)
  const task = store.getActiveTask()
  console.log('set_active_feature', data.featureId, task?.taskId)

  return {
    content: [{
      type: 'text' as const,
      text: `Active feature set to: ${data.featureId}. Active task: ${task?.taskId ?? 'none'}. Phase: ${task?.phase ?? 'unknown'}.`,
    }],
  }
})

// ── Await tools (role-specific) ───────────────────────────────────

server.registerTool('await_engineer_update', {
  description: [
    'REVIEWER ONLY. Call this to receive your next assignment or wait for the Engineer.',
    'Returns immediately if the current phase needs the Reviewer (AWAITING_DIRECTIVE, AWAITING_REVIEW).',
    'Blocks up to 30 seconds if waiting for the Engineer to submit.',
  ].join(' '),
  inputSchema: AwaitUpdateSchema,
}, async () => {
  return await handleAwait(REVIEWER_ACTIVE_PHASES)
})

server.registerTool('await_reviewer_update', {
  description: [
    'ENGINEER ONLY. Call this to receive your next assignment or wait for the Reviewer.',
    'Returns immediately if the current phase needs the Engineer (AWAITING_IMPLEMENTATION_REPORT, AWAITING_COMMENTS_RESOLUTION).',
    'Blocks up to 30 seconds if waiting for the Reviewer to submit.',
  ].join(' '),
  inputSchema: AwaitUpdateSchema,
}, async () => {
  return await handleAwait(ENGINEER_ACTIVE_PHASES)
})

// ── Action tools ──────────────────────────────────────────────────

server.registerTool('post_directive', {
  description: [
    'REVIEWER ONLY. Submit your technical blueprint for the Engineer.',
    'Only callable when phase is AWAITING_DIRECTIVE.',
    'After submitting, call `await_engineer_update` to wait for the Engineer\'s report.',
  ].join(' '),
  inputSchema: DirectiveSchema,
}, (data: Directive) => {
  const task = requireActiveTask()
  requirePhase(task, 'AWAITING_DIRECTIVE')

  console.log('post_directive', task.featureId, task.taskId)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    handoff: { type: 'directive', data },
  }))

  eventBus.trigger(
    `${task.featureId}.${task.taskId}.post_directive`,
    store.getActiveTask()!,
  )

  return {
    content: [{
      type: 'text' as const,
      text: 'Directive submitted. Phase: AWAITING_IMPLEMENTATION_REPORT. Call `await_engineer_update` to wait for the Engineer\'s report.',
    }],
  }
})

server.registerTool('post_implementation_report', {
  description: [
    'ENGINEER ONLY. Submit your implementation report.',
    'Callable when phase is AWAITING_IMPLEMENTATION_REPORT.',
    'After submitting, call `await_reviewer_update` to wait for the review.',
  ].join(' '),
  inputSchema: EngineerReportSchema,
}, (data: EngineerReport) => {
  const task = requireActiveTask()
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

  return {
    content: [{
      type: 'text' as const,
      text: 'Report submitted. Phase: AWAITING_REVIEW. Call `await_reviewer_update` to wait for the Reviewer\'s review.',
    }],
  }
})

server.registerTool('post_comments_resolution', {
  description: [
    'ENGINEER ONLY. Submit your resolution addressing the Reviewer\'s rejection.',
    'Callable when phase is AWAITING_COMMENTS_RESOLUTION.',
    'After submitting, call `await_reviewer_update` to wait for re-review.',
  ].join(' '),
  inputSchema: EngineerReportSchema,
}, (data: EngineerReport) => {
  const task = requireActiveTask()
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

  return {
    content: [{
      type: 'text' as const,
      text: 'Resolution submitted. Phase: AWAITING_REVIEW. Call `await_reviewer_update` to wait for re-review.',
    }],
  }
})

server.registerTool('post_approval', {
  description: [
    'REVIEWER ONLY. Approve the Engineer\'s work.',
    'Only callable when phase is AWAITING_REVIEW.',
    'Marks the current task COMPLETED and advances to the next task if one exists.',
    'After approving, call `await_engineer_update` to pick up the next task.',
  ].join(' '),
  inputSchema: ApprovalSchema,
}, (data: Approval) => {
  const task = requireActiveTask()
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
    { ...task, phase: 'COMPLETED', handoff: { type: 'approval', data } },
  )

  if (nextTask) {
    return {
      content: [{
        type: 'text' as const,
        text: `APPROVED. Task ${task.taskId} completed. Next task: ${nextTask.taskId} (${nextTask.phase}). Call \`await_engineer_update\` to continue.`,
      }],
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: `APPROVED. Task ${task.taskId} completed. No more tasks in feature ${task.featureId}. All done!`,
    }],
  }
})

server.registerTool('post_rejection', {
  description: [
    'REVIEWER ONLY. Reject the Engineer\'s work with required fixes.',
    'Only callable when phase is AWAITING_REVIEW.',
    'After rejecting, call `await_engineer_update` to wait for the Engineer\'s resolution.',
  ].join(' '),
  inputSchema: RejectionSchema,
}, (data: Rejection) => {
  const task = requireActiveTask()
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

  return {
    content: [{
      type: 'text' as const,
      text: 'REJECTED. Phase: AWAITING_COMMENTS_RESOLUTION. Call `await_engineer_update` to wait for the Engineer\'s fixes.',
    }],
  }
})

// ── Shared helpers ────────────────────────────────────────────────

function requireActiveTask(): TaskState {
  const task = store.getActiveTask()
  if (!task) {
    throw new Error('No active task. Create tasks with `create_task` and set the active feature with `set_active_feature` first.')
  }
  return task
}

function requirePhase(task: TaskState, ...allowed: Phase[]): void {
  if (!allowed.includes(task.phase)) {
    throw new Error(
      `Phase mismatch: current phase is ${task.phase}, ` +
      `but this tool requires ${allowed.join(' or ')}. ` +
      `Call the appropriate await tool to check the current state.`
    )
  }
}

/**
 * Core logic for both await tools.
 * If the current phase is in the caller's active phases, return immediately.
 * Otherwise, block up to AWAIT_TIMEOUT_MS waiting for a relevant event.
 */
async function handleAwait(activePhases: readonly Phase[]) {
  let task = store.getActiveTask()

  // If no active task, wait for one to be set
  if (!task) {
    console.log('await: no active task, waiting for set_active_task event')
    task = await waitForEventWithTimeout('set_active_task', AWAIT_TIMEOUT_MS)

    if (!task) {
      return {
        content: [{
          type: 'text' as const,
          text: '⏳ WAITING: No active task yet. Create tasks with `create_task` first, then call this tool again.',
        }],
      }
    }
  }

  // If current phase is NOT one where this role has work, block until it is
  if (!activePhases.includes(task.phase)) {
    const { featureId, taskId, phase } = task
    console.log(`await: phase ${phase} is not active for this role, waiting for event`)

    const eventsToWatch = getTransitionEvents(featureId, taskId, phase)
    const updatedTask = await waitForAnyEventWithTimeout(eventsToWatch, AWAIT_TIMEOUT_MS)

    if (!updatedTask) {
      return {
        content: [{
          type: 'text' as const,
          text: `⏳ WAITING: The other agent hasn't submitted yet. Current phase: ${phase}. Call this tool again to keep waiting.`,
        }],
      }
    }

    task = updatedTask
  }

  // At this point, the current phase IS active for this role
  return buildBriefing(task)
}

/**
 * Determine which events would cause a phase transition
 * relevant to the waiting role.
 */
function getTransitionEvents(featureId: string, taskId: string, phase: Phase): TaskEventName[] {
  const prefix = `${featureId}.${taskId}` as const
  switch (phase) {
    case 'AWAITING_DIRECTIVE':
      return [`${prefix}.post_directive`]
    case 'AWAITING_IMPLEMENTATION_REPORT':
      return [`${prefix}.post_implementation_report`]
    case 'AWAITING_REVIEW':
      return [`${prefix}.post_approval`, `${prefix}.post_rejection`]
    case 'AWAITING_COMMENTS_RESOLUTION':
      return [`${prefix}.post_comments_resolution`]
    case 'COMPLETED':
      return []
    default:
      return []
  }
}

function waitForEventWithTimeout(
  event: TaskEventName,
  timeoutMs: number,
): Promise<TaskState | null> {
  return waitForAnyEventWithTimeout([event], timeoutMs)
}

function waitForAnyEventWithTimeout(
  events: TaskEventName[],
  timeoutMs: number,
): Promise<TaskState | null> {
  if (events.length === 0) {
    return Promise.resolve(null)
  }

  return new Promise<TaskState | null>(resolve => {
    let settled = false
    const registeredListeners: { event: TaskEventName; fn: TaskEventListener }[] = []

    const cleanup = () => {
      clearTimeout(timer)
      registeredListeners.forEach(({ event, fn }) => eventBus.off(event, fn))
    }

    const settle = (result: TaskState | null) => {
      if (!settled) {
        settled = true
        cleanup()
        resolve(result)
      }
    }

    const timer = setTimeout(() => settle(null), timeoutMs)

    events.forEach(event => {
      const fn: TaskEventListener = (payload) => settle(payload)
      eventBus.on(event, fn)
      registeredListeners.push({ event, fn })
    })
  })
}

function buildBriefing(task: TaskState) {
  // Re-read from store to get the latest state
  const currentTask = store.getActiveTask() ?? task

  let handoff: Handoff | null = null
  if (currentTask.handoff) {
    handoff = currentTask.handoff
  }

  const briefing: Briefing = {
    featureId: currentTask.featureId,
    taskId: currentTask.taskId,
    phase: currentTask.phase,
    task: currentTask,
    handoff,
    instructions: getPhaseDirective(currentTask.phase),
  }

  return {
    content: [{
      type: 'text' as const,
      text: `### MISSION BRIEFING\n${JSON.stringify(briefing, null, 2)}`,
    }],
  }
}

// ── Start ─────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
server.connect(transport).then(() => {
  console.log('Relay MCP Server running (v6.1.0)')
}).catch(err => {
  console.error('Failed to start Relay MCP Server', err)
  process.exit(1)
})
