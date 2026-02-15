import { z } from 'zod'

export const CreateTaskSchema = z.object({
  featureId: z.string().describe('Unique identifier for the feature, e.g., \'user-auth\''),
  taskId: z.string().describe('Specific task within the feature, e.g., \'jwt-implementation\''),
  spec: z.object({
    objective: z.string().describe('The primary goal of this task.'),
    requirements: z.array(z.string()).describe('Specific functional requirements to be met.'),
    constraints: z.array(z.string()).describe('Non-functional requirements or architectural boundaries.'),
  }),
})

export const DirectiveSchema = z.object({
  blueprint: z.string().describe('The high-level technical design and logic flow for this task.'),
  files_to_touch: z.array(z.string()).describe('List of relative file paths that the Engineer is permitted to modify.'),
  technical_constraints: z.array(z.string()).describe('Specific implementation rules, e.g., "Use early returns", "No external utils".'),
})

export const CommandStatusSchema = z.object({
  checkId: z.string().describe('Identifier for the check, e.g., "build", "tests", "linter"'),
  status: z.enum(['passed', 'failed', 'got_lazy']).describe('The result of the command execution.'),
  command: z.string().describe('The exact shell command executed to verify the implementation.'),
  relative_path: z.string().default('.').describe('The directory relative to project root where the command was run.'),
})

export const EngineerReportSchema = z.object({
  files_modified: z.array(z.string()).describe('List of all files actually changed during implementation.'),
  self_review_status: z.enum([
    'manually_reviewed_and_confirmed',
    'manually_reviewed_and_ignored_issues',
    'did_not_review_got_lazy'
  ]).describe('Engineer\'s self-assessment of the code quality before submission.'),
  checks: z.array(CommandStatusSchema).describe('List of terminal commands run to prove implementation validity.'),
  coverage_status: z.enum(['new_functionality_fully_covered', 'got_lazy']).describe('Confirmation of test coverage for new logic.'),
  implementation_status: z.enum(['fully_implemented', 'got_lazy']).describe('Confirmation that all requirements from the spec were addressed.'),
  implementation_notes: z.string().describe('Details regarding the technical choices or hurdles encountered during coding.'),
  responsibility_ownership: z.enum(['I_the_engineer_am_responsible', 'dismiss']).describe('A formal claim of responsibility for the submitted work.'),
})

export const ApprovalSchema = z.object({
  decision: z.literal('approved'),

  manual_review_confirmation: z.enum([
    'manually_reviewed_each_file_and_line',
    'manually_reviewed_partially_because_got_lazy',
    'did_not_review_got_lazy'
  ]).describe('Statement of code verification effort: did you fully review each change using a zero-trust policy?'),

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
  ]).describe('Confirmation that the terminal verification results (Engineer\'s checks) were inspected.'),

  verification_critique: z.string().describe(
    'Critique the Engineer\'s verification strategy. Were the checkIds (build, test, etc.) sufficient to prove correctness?'
  ),

  constraint_compliance: z.enum([
    'all_technical_constraints_strictly_met',
    'constraints_partially_met_but_acceptable',
    'ignored_constraints_because_got_lazy'
  ]).describe('Assertion that the implementation adheres to the technical_constraints defined in the directive.'),

  constraint_justification: z.string().describe(
    'Explain how the code specifically satisfies the technical_constraints set in the directive.'
  ),

  responsibility_ownership: z.enum([
    'I_the_architect_am_responsible_for_quality',
    'dismiss'
  ]).describe('Formal assumption of risk for the code entering the codebase.'),

  next_task_directive: DirectiveSchema.describe('Instructions for the next block of work following this approval.'),
})

export const RejectionSchema = z.object({
  decision: z.literal('rejected'),
  rejection_reason: z.string().describe('High-level explanation of why the work failed to meet standards.'),
  required_fixes: z.array(z.string()).describe('List of mandatory changes the Engineer must implement for the next submission.'),
  suggestions: z.array(z.string()).optional().describe('Non-mandatory improvements or architectural advice.'),
})