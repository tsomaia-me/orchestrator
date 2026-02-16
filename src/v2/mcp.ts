import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ApprovalSchema,
  CreateTaskSchema,
  DirectiveSchema,
  EngineerReportSchema, LoadProtocolSchema,
  RejectionSchema,
  SetActiveFeatureSchema,
} from './schema'
import { createEmptyState, getPhaseDirective, initialize, runTruthCheck } from './helpers'
import {
  Approval,
  Briefing,
  CreateTask,
  Directive,
  EngineerReport,
  Handoff, LoadProtocol,
  Rejection, SetActiveFeature, TaskEventListener,
  TaskEventName,
  TaskState,
} from './types'
import { z } from 'zod'
import { RelayStore } from './relay-store'
import { FilePersistence } from './persistence/file-persistence'
import { EventListener } from './event-listener'
import { ToolCallback } from '@modelcontextprotocol/sdk/dist/esm/server/mcp'

const server = new McpServer({ name: 'relay-orchestrator', version: '5.0.0' })

const persistence = new FilePersistence('.relay/state.json')
const store = new RelayStore({
  initialState: createEmptyState(),
  persistence: persistence,
})
const listener = new EventListener()

server.registerTool('load_planner_protocol', {
  description: 'Gives the Head Architect (planner) their specific operational guidelines.',
  inputSchema: LoadProtocolSchema,
}, async (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  console.log('load_planner_protocol')
  return {
    content: [{
      type: 'text',
      text: `## Head Architect (Planner) Protocol
1. **Scope**: Analyze the user's high-level feature request. Identify dependencies and the "Definition of Done."
2. **Decompose**: Break the feature into small, atomic, sequential tasks (e.g., \`db-setup\` -> \`auth-api\` -> \`login-ui\`).
3. **Validate**: Present the proposed list of \`taskId\`s and \`objectives\` to the user. **STOP and wait for manual approval.**
4. **Execute**: Only after user confirmation, call \`create_task\` for every item in the plan.
5. **Handoff**: Confirm that the task queue is populated and ready for the Architect to begin the first task.`,
    }],
  }
})

server.registerTool('load_architect_protocol', {
  description: 'Gives the Architect their specific operational guidelines.',
  inputSchema: LoadProtocolSchema,
}, async (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  console.log('load_architect_protocol')
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
  inputSchema: LoadProtocolSchema,
}, async (data: LoadProtocol) => {
  initialize(data.projectRoot, persistence)
  console.log('load_engineer_protocol')
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

server.registerTool('create_task', {
  description: 'Initializes a new task within a feature.',
  inputSchema: CreateTaskSchema,
}, async (input: CreateTask) => {
  const { featureId, taskId, spec } = input

  console.log('create_task', input)

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

server.registerTool('post_directive', {
  description: 'Architect submits blueprint to Engineer.',
  inputSchema: DirectiveSchema,
}, async (data: Directive) => {
  const task = store.getActiveTask()

  console.log('post_directive', data, task)

  if (task.phase !== 'AWAITING_DIRECTIVE') {
    throw new Error(`Phase mismatch: ${task.phase}`)
  }

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_IMPLEMENTATION_REPORT',
    handoff: { type: 'directive', data },
  }))
  listener.trigger(
    `${task.featureId}.${task.taskId}.post_directive`,
    task,
  )

  return await getBriefing([
    { type: 'text', text: 'Directive locked. Phase: AWAITING_IMPLEMENTATION_REPORT.' },
  ])
})

server.registerTool('post_implementation_report', {
  description: 'Engineer submits implementation for verification.',
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = store.getActiveTask()

  console.log('post_implementation_report', data, task)

  if (!['AWAITING_IMPLEMENTATION_REPORT', 'AWAITING_COMMENTS_RESOLUTION'].includes(task.phase)) {
    throw new Error('Phase mismatch.')
  }

  runTruthCheck(data.checks)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))
  listener.trigger(
    `${task.featureId}.${task.taskId}.post_implementation_report`,
    task,
  )

  return await getBriefing([
    { type: 'text', text: 'Truth-check passed. Phase: AWAITING_ARCHITECT_REVIEW.' },
  ])
})

server.registerTool('post_comments_resolution', {
  description: 'Engineer submits comments resolution for further review.',
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = store.getActiveTask()

  console.log('post_comments_resolution', data, task)

  if (!['AWAITING_COMMENTS_RESOLUTION'].includes(task.phase)) {
    throw new Error('Phase mismatch.')
  }

  runTruthCheck(data.checks)

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_REVIEW',
    handoff: { type: 'report', data },
  }))
  listener.trigger(
    `${task.featureId}.${task.taskId}.post_comments_resolution`,
    task,
  )

  return await getBriefing([
    { type: 'text', text: 'Truth-check passed. Phase: AWAITING_ARCHITECT_REVIEW.' },
  ])
})

server.registerTool('post_approval', {
  description: 'Architect approves work.',
  inputSchema: ApprovalSchema,
}, async (data: Approval) => {
  const task = store.getActiveTask()

  console.log('post_approval', data, task)

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
    listener.trigger(
      `${task.featureId}.${task.taskId}.post_approval`,
      task,
    )
  } else {
    store.updateActiveTask(prev => ({
      ...prev,
      phase: 'COMPLETED',
      handoff: { type: 'approval', data },
    }))
    listener.trigger(
      `${task.featureId}.${task.taskId}.post_approval`,
      task,
    )
    listener.trigger(
      `${task.featureId}.${task.taskId}.completed`,
      task,
    )
  }

  return await getBriefing([
    { type: 'text', text: 'APPROVED. Task moved to COMPLETED.' },
  ])
})

server.registerTool('post_rejection', {
  description: 'Architect rejects work with required fixes.',
  inputSchema: RejectionSchema,
}, async (data: Rejection) => {
  const task = store.getActiveTask()

  console.log('post_rejection', data, task)

  if (task.phase !== 'AWAITING_REVIEW') {
    throw new Error('Phase mismatch.')
  }

  store.updateActiveTask(prev => ({
    ...prev,
    phase: 'AWAITING_COMMENTS_RESOLUTION',
    handoff: { type: 'rejection', data },
  }))
  listener.trigger(
    `${task.featureId}.${task.taskId}.post_rejection`,
    task,
  )

  return await getBriefing([
    { type: 'text', text: 'REJECTED. Returning to Engineer for fixes.' },
  ])
})

server.registerTool('set_active_feature', {
  description: 'Sets active feature.',
  inputSchema: SetActiveFeatureSchema,
}, async (data: SetActiveFeature) => {
  store.setActiveFeature(data.featureId)
  const task = store.getActiveTask()

  console.log('set_active_feature', data, task)

  listener.trigger(
    'set_active_task',
    task,
  )

  return {
    content: [
      { type: 'text', text: 'Active task set.' }
    ]
  }
})

server.registerTool('await_update', {
  description: 'Polls the relay for the current state and receives a contextual mission briefing.',
  inputSchema: z.object({}),
}, async () => {
  return await getBriefing()
})


async function getBriefing<T>(items: ReturnType<ToolCallback<T>>['content'] = []) {
  let task = store.getActiveTask()

  console.log('await_update', task)

  if (!task) {
    console.log('await_update', 'waiting for task')
    task = await listener.listen('set_active_task')
    console.log('await_update', 'got task', task)
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
      listeners.forEach(({ name, fn }) => listener.off(name, fn))
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
      listener.on(name, handleEvent)
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
      ...items,
      { type: 'text', text: `### MISSION BRIEFING\n${JSON.stringify(briefing, null, 2)}` }
    ].filter(Boolean),
  }
}

const transport = new StdioServerTransport()
server.connect(transport).then(() => {
  console.log('MCP Initiated')
}).catch(console.error)
