import { execSync } from 'node:child_process'
import { z } from 'zod'
import { EngineerReportSchema } from './schema'
import path from 'path'
import { RelayState } from './types'

export function createEmptyState(): RelayState {
  return {
    features: {},
    currentContext: null,
  };
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

export function getActiveTask(state: RelayState) {
  if (!state.currentContext) {
    throw new Error('No active context. Call create_task or switch_context first.')
  }

  const { featureId, taskId } = state.currentContext

  return state.features[featureId].tasks[taskId]
}
