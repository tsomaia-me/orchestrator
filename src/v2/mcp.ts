import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'
import { createEmptyState, getActiveTask, runTruthCheck } from './helpers'
import { Approval, CreateTask, Directive, EngineerReport, Rejection } from './types'

const server = new McpServer({ name: 'relay-orchestrator', version: '5.0.0' })

const STATE = createEmptyState()

server.registerTool('create_task', {
  description: 'Initializes a new task within a feature.',
  inputSchema: CreateTaskSchema,
}, async (input: CreateTask) => {
  const { featureId, taskId, spec } = input
  if (!STATE.features[featureId]) STATE.features[featureId] = { tasks: {} }

  STATE.features[featureId].tasks[taskId] = {
    phase: 'INITIAL',
    spec,
    handoff: null,
  }
  STATE.currentContext = { featureId, taskId }
  return {
    content: [{
      type: 'text',
      text: `Context set: ${featureId}/${taskId}. Phase: INITIAL.`,
    }],
  }
})

server.registerTool('post_directive', {
  description: 'Architect submits blueprint to Engineer.',
  inputSchema: DirectiveSchema,
}, async (data: Directive) => {
  const task = getActiveTask(STATE)

  if (task.phase !== 'AWAITING_DIRECTIVE') {
    throw new Error(`Phase mismatch: ${task.phase}`)
  }

  task.handoff = data
  task.phase = 'AWAITING_IMPLEMENTATION_REPORT'

  return {
    content: [
      { type: 'text', text: 'Directive locked. Phase: AWAITING_ENGINEER.' },
    ],
  }
})

server.registerTool('post_implementation_report', {
  description: 'Engineer submits implementation for verification.',
  inputSchema: EngineerReportSchema,
}, async (data: EngineerReport) => {
  const task = getActiveTask(STATE)

  if (!['AWAITING_IMPLEMENTATION_REPORT', 'AWAITING_COMMENTS_RESOLUTION'].includes(task.phase)) {
    throw new Error('Phase mismatch.')
  }

  runTruthCheck(data.checks)

  task.handoff = data
  task.phase = 'AWAITING_REVIEW'

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
  const task = getActiveTask(STATE)
  if (task.phase !== 'AWAITING_REVIEW') {
    throw new Error('Phase mismatch.')
  }

  task.handoff = data
  task.phase = 'COMPLETED'

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
  const task = getActiveTask(STATE)
  if (task.phase !== 'AWAITING_REVIEW') {
    throw new Error('Phase mismatch.')
  }

  task.handoff = data
  task.phase = 'AWAITING_COMMENTS_RESOLUTION'

  return {
    content: [
      { type: 'text', text: 'REJECTED. Returning to Engineer for fixes.' },
    ],
  }
})

server.registerTool('await_update', {
  description: 'Get current feature/task state.',
}, async () => {
  return {
    content: [
      { type: 'text', text: JSON.stringify(STATE, null, 2) },
    ],
  }
})

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
