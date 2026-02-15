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

  manual_review_confirmation: z.enum([
    'manually_reviewed_each_file_and_line',
    'manually_reviewed_partially_because_got_lazy',
    'did_not_review_got_lazy'
  ]).describe('Statement of code verification effort: did you fully reviewed each change using a zer-trust policy?'),

  strictness_enforcement_confirmation: z.enum([
    'zero_tolerance_enforced_no_minor_issues_found',
    'minor_issues_found_but_approved_anyway_because_got_lazy',
    'did_not_enforce_strictness_got_lazy'
  ]).describe('Did you strictly enforce a zero-tolerance policy for even minor style or logic issues?'),

  review_summary: z.string().min(20).describe(
    'A detailed summary of why this code is acceptable. Must reference specific logic implemented.'
  ),

  truth_check_verification: z.enum([
    'verified_all_engineer_commands_passed',
    'ignored_engineer_command_failures_because_got_lazy',
    'did_not_verify_engineer_checks'
  ]).describe('Confirmation that the terminal verification results were inspected.'),

  verification_critique: z.string().describe(
    'Critique the Engineer\'s verification strategy. Were the checkIds (build, test, etc.) sufficient?'
  ),

  constraint_compliance: z.enum([
    'all_technical_constraints_strictly_met',
    'constraints_partially_met_but_acceptable',
    'ignored_constraints_because_got_lazy'
  ]),

  constraint_justification: z.string().describe(
    'Explain how the code specifically satisfies the technical_constraints set in the directive.'
  ),

  responsibility_ownership: z.enum([
    'I_the_architect_am_responsible_for_quality',
    'dismiss'
  ]),

  next_task_directive: DirectiveSchema.describe('Instructions for the next block of work'),
})

export const RejectionSchema = z.object({
  decision: z.literal('rejected'),
  rejection_reason: z.string(),
  required_fixes: z.array(z.string()),
  suggestions: z.array(z.string()).optional(),
})
