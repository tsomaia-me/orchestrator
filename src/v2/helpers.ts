import { execSync } from 'node:child_process'
import { z } from 'zod'
import { EngineerReportSchema } from './schema'
import path from 'path'
import { Phase, RelayState } from './types'

export function createEmptyState(): RelayState {
  return {
    features: [],
    currentContext: null,
  }
}

export function runTruthCheck(checks: z.infer<typeof EngineerReportSchema>['checks']) {
  for (const check of checks) {
    if (check.status === 'got_lazy') continue
    try {
      const runPath = path.resolve(process.cwd(), check.relative_path)
      execSync(check.command, { cwd: runPath, stdio: 'pipe', timeout: 60000 })
    } catch (e: any) {
      throw new Error(`[VERIFICATION FAILURE] ${check.checkId}: ${e.stderr?.toString() || e.message}`)
    }
  }
}

export function getPhaseDirective(phase: Phase): string {
  switch (phase) {
    case 'AWAITING_DIRECTIVE':
      return 'You are acting as the ARCHITECT. Analyze the task \'spec\' and provide a technical \'blueprint\' via \'post_directive\'. Call \'load_architect_protocol\' if you need a refresher on standards.'

    case 'AWAITING_IMPLEMENTATION_REPORT':
      return 'You are acting as the ENGINEER. Implement the blueprint found in \'current_handoff\'. You MUST verify your work with shell commands and report them via \'post_implementation_report\'. Call \'load_engineer_protocol\' for your SOPs.'

    case 'AWAITING_REVIEW':
      return 'You are acting as the ARCHITECT. Review the \'current_handoff\' (the Engineer\'s report). Check their truth-check commands for validity. Approve via \'post_approval\' or reject via \'post_rejection\'.'

    case 'AWAITING_COMMENTS_RESOLUTION':
      return 'You are acting as the ENGINEER. The previous implementation was REJECTED. Review the \'current_handoff\' for required fixes, implement them, and re-submit using \'post_implementation_report\'.'

    case 'COMPLETED':
      return 'This task is marked as COMPLETED. No further action is required unless a new task is initialized.'

    default:
      return 'Analyze the current state data and proceed with the logical next step in the development lifecycle.'
  }
}
