import { z } from 'zod'

export const CreateTaskSchema = z.object({
  featureId: z.string().describe('e.g., \'user-auth\''),
  taskId: z.string().describe('e.g., \'jwt-implementation\''),
  spec: z.object({
    objective: z.string(),
    requirements: z.array(z.string()),
    constraints: z.array(z.string()),
  }),
})

export const DirectiveSchema = z.object({
  blueprint: z.string(),
  files_to_touch: z.array(z.string()),
  technical_constraints: z.array(z.string()),
})

export const CommandStatusSchema = z.object({
  checkId: z.string().describe('e.g., "build", "tests", "liner", etc'),
  status: z.enum(['passed', 'failed', 'got_lazy']),
  command: z.string().describe('The exact shell command used for this specific check'),
  relative_path: z.string().default('.').describe('The directory relative to project root where the command should run (e.g. \'./backend\')'),
})

export const EngineerReportSchema = z.object({
  files_modified: z.array(z.string()),
  self_review_status: z.enum(['manually_reviewed_and_confirmed', 'manually_reviewed_and_ignored_issues', 'did_not_review_got_lazy']),
  checks: z.array(CommandStatusSchema),
  coverage_status: z.enum(['new_functionality_fully_covered', 'got_lazy']),
  implementation_status: z.enum(['fully_implemented', 'got_lazy']),
  implementation_notes: z.string(),
  responsibility_ownership: z.enum(['I_the_engineer_am_responsible', 'dismiss']),
})

export const ApprovalSchema = z.object({
  decision: z.literal('approved'),
  next_task_directive: DirectiveSchema.describe('Instructions for the next block of work'),
})

export const RejectionSchema = z.object({
  decision: z.literal('rejected'),
  rejection_reason: z.string(),
  required_fixes: z.array(z.string()),
  suggestions: z.array(z.string()).optional(),
})
