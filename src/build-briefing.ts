import { TemplateManager } from './template-manager'
import { TaskState } from './types'

export interface BriefingStore {
  getActiveTask(): TaskState | null
}

/**
 * Builds a briefing response for the active task.
 * Phase selection determines which template is used.
 */
export function buildBriefing(
  task: TaskState | null,
  store: BriefingStore,
  templateManager: TemplateManager,
  getProjectRoot: () => string,
): { content: [{ type: 'text'; text: string }] } {
  templateManager.initialize(getProjectRoot())
  const currentTask = store.getActiveTask() ?? task

  if (!currentTask) {
    const text = templateManager.render('briefing_no_active_task.mx', { task: null })
    return { content: [{ type: 'text' as const, text }] }
  }

  const ctx = { task: currentTask }
  let templateName: string
  switch (currentTask.phase) {
    case 'AWAITING_IMPLEMENTATION_REPORT':
      templateName = 'briefing_awaiting_implementation_report.mx'
      break
    case 'AWAITING_REVIEW':
      templateName = 'briefing_awaiting_review.mx'
      break
    case 'AWAITING_COMMENTS_RESOLUTION':
      templateName = 'briefing_awaiting_comments_resolution.mx'
      break
    case 'COMPLETED':
      templateName = 'briefing_completed.mx'
      break
    default:
      templateName = 'briefing_no_active_task.mx'
  }

  const text = templateManager.render(templateName, ctx)
  return {
    content: [{ type: 'text' as const, text }],
  }
}
