import { z } from 'zod'
import { ApprovalSchema, CreateTaskSchema, DirectiveSchema, EngineerReportSchema, RejectionSchema } from './schema'

/**
 * These definitions are what the MCP server uses to describe
 * its capabilities to Cursor/the Agent.
 */
export const tools = {
  create_task: {
    name: 'create_task',
    description: 'Initializes a new feature and task. Sets the project to AWAITING_ARCHITECT_DIRECTIVE.',
    schema: CreateTaskSchema,
  },

  await_update: {
    name: 'await_update',
    description: 'Polls the relay for the current state, task specs, or previous agent handoffs. Call this at the start of every session.',
    schema: z.object({}),
  },

  post_directive: {
    name: 'post_directive',
    description: 'Architect submits the technical blueprint and constraints. Advances phase to AWAITING_ENGINEER.',
    schema: DirectiveSchema,
  },

  post_implementation_report: {
    name: 'post_implementation_report',
    description: 'Engineer submits work summary and command-linked verification checks. Triggers server-side Truth-Check.',
    schema: EngineerReportSchema,
  },

  post_approval: {
    name: 'post_approval',
    description: 'Architect approves the work and provides the directive for the next task.',
    schema: ApprovalSchema,
  },

  post_rejection: {
    name: 'post_rejection',
    description: 'Architect rejects the work due to quality or logic issues.',
    schema: RejectionSchema,
  },

  post_comments_resolution: {
    name: 'post_comments_resolution',
    description: 'Engineer submits a report specifically addressing the Architect\'s rejection comments.',
    schema: EngineerReportSchema,
  },
}
