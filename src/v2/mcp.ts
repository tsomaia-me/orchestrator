import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'
import { createEmptyState, getActiveTask, runTruthCheck } from './helpers'
import { Approval, CreateTask, Directive, EngineerReport, Rejection } from './types'
import { z } from 'zod'

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
  description: 'Polls the relay for the current state and receives a contextual mission briefing.',
  inputSchema: z.object({}),
}, async () => {
  const task = getActiveTask(STATE)
  const context = STATE.currentContext!

  let briefing: any = {
    featureId: context.featureId,
    taskId: context.taskId,
    phase: task.phase,
    spec: task.spec,
  }

  switch (task.phase) {
    case 'AWAITING_DIRECTIVE':
      briefing.instructions = 'You are the ARCHITECT. Analyze the \'spec\' and provide a technical \'blueprint\' using \'post_directive\'.'
      briefing.required_next_tool = 'post_directive'
      break

    case 'AWAITING_IMPLEMENTATION_REPORT':
      briefing.instructions = 'You are the ENGINEER. Implement the \'blueprint\' provided in the \'handoff\'. You MUST run the truth-check commands listed in your config.'
      briefing.architect_handoff = task.handoff
      briefing.required_next_tool = 'post_implementation_report'
      break

    case 'AWAITING_REVIEW':
      briefing.instructions = 'You are the ARCHITECT. Review the \'engineer_handoff\' for quality and correctness. Approve or reject.'
      briefing.engineer_handoff = task.handoff
      briefing.required_next_tool = ['post_approval', 'post_rejection']
      break

    case 'AWAITING_COMMENTS_RESOLUTION':
      briefing.instructions = 'You are the ENGINEER. The Architect REJECTED the previous work. Fix the \'required_fixes\' and re-submit.'
      briefing.rejection_details = task.handoff
      briefing.required_next_tool = 'post_implementation_report'
      break
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(briefing, null, 2),
    }],
  }
})

const transport = new StdioServerTransport()
server.connect(transport).catch(console.error)
