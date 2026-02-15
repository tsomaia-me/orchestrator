import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'
import { createEmptyState, getPhaseDirective, runTruthCheck } from './helpers'
import {
  Approval,
  Briefing,
  CreateTask,
  Directive,
  EngineerReport,
  Handoff,
  Rejection, TaskEventListener,
  TaskEventName,
  TaskState,
} from './types'
import { z } from 'zod'
import { RelayStore } from './relay-store'
import { FilePersistence } from './persistence/file-persistence'
import { EventListener } from './event-listener'

const server = new McpServer({ name: 'relay-orchestrator', version: '5.0.0' })

const store = new RelayStore({
  initialState: createEmptyState(),
  persistence: new FilePersistence('.relay/state.json'),
})
const eventListener = new EventListener()

server.registerTool('create_task', {
  description: 'Initializes a new task within a feature.',
  inputSchema: CreateTaskSchema,
}, async (input: CreateTask) => {
  const { featureId, taskId, spec } = input

  store.addTask({
    featureId,
    taskId,
    phase: 'AWAITING_DIRECTIVE',
    spec,
    handoff: null,
  })

  return {
    content: [{
      type: 'text',
      text: `Context set: ${featureId}/${taskId}. Phase: AWAITING_DIRECTIVE.`,
    }],
  }
})

server.registerTool('load_architect_protocol', {
  description: 'Gives the Architect their specific operational guidelines.',
  inputSchema: z.object({}),
}, async () => {
  return {
    content: [{
      type: 'text',
      text: `## Architect Protocol
1. **Analyze**: Call 'await_update' to understand the task spec.
2. **Design**: Create a technical blueprint including file paths and logic.
3. **Enforce**: Define specific 'technical_constraints' for the Engineer.
4. **Submit**: Use 'post_directive' to lock your plan and hand over to the Engineer.
5. **Review**: When called back, verify if the Engineer met all constraints.`,
    }],
  }
})

server.registerTool('load_engineer_protocol', {
  description: 'Gives the Engineer their specific operational guidelines.',
  inputSchema: z.object({}),
}, async () => {
  return {
    content: [{
      type: 'text',
      text: `## Engineer Protocol
1. **Ingest**: Call 'await_update' to read the Architect's directive.
2. **Implement**: Code the changes as requested.
3. **Verify**: Run build, tests, and linting locally.
4. **Truth-Check**: You MUST provide the exact shell commands you ran in your report.
5. **Submit**: Use 'post_implementation_report'. If the server-side check fails, you must fix and re-submit.`,
    }],
  }
})

server.registerTool('post_directive', {
  description: 'Architect submits blueprint to Engineer.',
  inputSchema: DirectiveSchema,
}, async (data: Directive) => {
  const task = store.getActiveTask()

  if (!task) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  if (task.phase !== 'AWAITING_DIRECTIVE') {
    throw new Error(`Phase mismatch: ${task.phase}`)
  }

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    handoff: { type: 'directive', data },
  }))
  eventListener.trigger(
    `${task.featureId}.${task.taskId}.post_directive`,
    task,
  )

  return {
    content: [
      { type: 'text', text: 'Directive locked. Phase: AWAITING_IMPLEMENTATION_REPORT.' },
    ],
  }
})

server.registerTool('post_implementation_report', {
  description: 'Engineer submits implementation for verification.',
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = store.getActiveTask()

  if (!task) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  if (!['AWAITING_IMPLEMENTATION_REPORT', 'AWAITING_COMMENTS_RESOLUTION'].includes(task.phase)) {
    throw new Error('Phase mismatch.')
  }

  runTruthCheck(data.checks)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))
  eventListener.trigger(
    `${task.featureId}.${task.taskId}.post_implementation_report`,
    task,
  )

  return {
    content: [
      { type: 'text', text: 'Truth-check passed. Phase: AWAITING_ARCHITECT_REVIEW.' },
    ],
  }
})

server.registerTool('post_comments_resolution', {
  description: 'Engineer submits comments resolution for further review.',
  inputSchema: EngineerReportSchema,
}, (data: EngineerReport) => {
  const task = store.getActiveTask()

  if (!task) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  if (!['AWAITING_COMMENTS_RESOLUTION'].includes(task.phase)) {
    throw new Error('Phase mismatch.')
  }

  runTruthCheck(data.checks)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))
  eventListener.trigger(
    `${task.featureId}.${task.taskId}.post_comments_resolution`,
    task,
  )

  return {
    content: [
      { type: 'text', text: 'Truth-check passed. Phase: AWAITING_ARCHITECT_REVIEW.' },
    ],
  }
})

server.registerTool('post_approval', {
  description: 'Architect approves work.',
  inputSchema: ApprovalSchema,
}, async (data: Approval) => {
  const task = store.getActiveTask()

  if (!task) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  if (task.phase !== 'AWAITING_REVIEW') {
    throw new Error('Phase mismatch.')
  }

  const nextTask = store.getNextTask()

  if (nextTask) {
    store.updateActiveTask(prev => ({
      ...prev,
      phase: 'AWAITING_IMPLEMENTATION_REPORT',
      handoff: { type: 'approval', data },
    }))
    eventListener.trigger(
      `${task.featureId}.${task.taskId}.post_approval`,
      task,
    )
  } else {
    store.updateActiveTask(prev => ({
      ...prev,
      phase: 'COMPLETED',
      handoff: { type: 'approval', data },
    }))
    eventListener.trigger(
      `${task.featureId}.${task.taskId}.post_approval`,
      task,
    )
    eventListener.trigger(
      `${task.featureId}.${task.taskId}.completed`,
      task,
    )
  }

  return {
    content: [
      { type: 'text', text: 'APPROVED. Task moved to COMPLETED.' },
    ],
  }
})

server.registerTool('post_rejection', {
  description: 'Architect rejects work with required fixes.',
  inputSchema: RejectionSchema,
}, async (data: Rejection) => {
  const task = store.getActiveTask()

  if (!task) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  if (task.phase !== 'AWAITING_REVIEW') {
    throw new Error('Phase mismatch.')
  }

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_COMMENTS_RESOLUTION',
    handoff: { type: 'rejection', data },
  }))
  eventListener.trigger(
    `${task.featureId}.${task.taskId}.post_rejection`,
    task,
  )

  return {
    content: [
      { type: 'text', text: 'REJECTED. Returning to Engineer for fixes.' },
    ],
  }
})

server.registerTool('await_update', {
  description: 'Polls the relay for the current state and receives a contextual mission briefing.',
  inputSchema: z.object({}),
}, async () => {
  const task = store.getActiveTask()

  if (!task) {
    return {
      content: [
        { type: 'text', text: "No active task context." }
      ]
    }
  }

  const { featureId, taskId, phase } = task
  const eventsToWatch: TaskEventName[] = []

  switch (phase) {
    case 'AWAITING_DIRECTIVE':
      eventsToWatch.push(`${featureId}.${taskId}.post_directive`)
      break
    case 'AWAITING_IMPLEMENTATION_REPORT':
      eventsToWatch.push(`${featureId}.${taskId}.post_implementation_report`)
      break
    case 'AWAITING_REVIEW':
      eventsToWatch.push(`${featureId}.${taskId}.post_approval`)
      eventsToWatch.push(`${featureId}.${taskId}.post_rejection`)
      break
    case 'AWAITING_COMMENTS_RESOLUTION':
      eventsToWatch.push(`${featureId}.${taskId}.post_comments_resolution`)
      break
    case 'COMPLETED':
      // No events to wait for; return immediately
      break
  }

  const newState = await new Promise<TaskState | null>((resolve) => {
    if (eventsToWatch.length === 0) {
      return resolve(null)
    }

    let isResolved = false
    const listeners: { name: TaskEventName, fn: TaskEventListener }[] = []

    const cleanup = () => {
      clearTimeout(timer)
      listeners.forEach(({ name, fn }) => eventListener.off(name, fn))
    }

    const handleEvent = (payload: TaskState) => {
      if (!isResolved) {
        isResolved = true
        cleanup()
        resolve(payload)
      }
    }

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true
        cleanup()
        resolve(null)
      }
    }, 30000)

    eventsToWatch.forEach(name => {
      eventListener.on(name, handleEvent)
      listeners.push({ name, fn: handleEvent })
    })
  })

  const finalTask = newState || store.getActiveTask()!

  let handoff: Handoff | null = null

  if (finalTask.handoff) {
    const mapping: Record<string, Handoff['type']> = {
      'AWAITING_IMPLEMENTATION_REPORT': 'directive',
      'AWAITING_REVIEW': 'report',
      'AWAITING_COMMENTS_RESOLUTION': 'rejection',
      'COMPLETED': 'approval'
    }
    const type = mapping[finalTask.phase]
    if (type) {
      handoff = { type, data: finalTask.handoff.data } as Handoff
    }
  }

  const briefing: Briefing = {
    featureId: finalTask.featureId,
    taskId: finalTask.taskId,
    phase: finalTask.phase,
    task: finalTask,
    handoff: handoff,
    instructions: getPhaseDirective(finalTask.phase)
  }

  return {
    content: [
      { type: 'text', text: `### MISSION BRIEFING\n${JSON.stringify(briefing, null, 2)}` }
    ],
  }
})

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
