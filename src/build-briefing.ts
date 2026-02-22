import { db } from './db';
import { exchanges, tasks, features, projects } from './db/schema';
import { templateManager } from './template-manager';
import { eq, desc } from 'drizzle-orm';

/**
 * Builds a briefing response for a specific task based on the SQLite ledger.
 * Phase selection determines which template is used based on the HEAD of the exchange chain.
 */
export async function buildBriefing(taskId: string): Promise<{ content: [{ type: 'text' | 'text'; text: string }] }> {
  const headArr = await db.select().from(exchanges)
    .where(eq(exchanges.taskId, taskId))
    .orderBy(desc(exchanges.createdAt))
    .limit(1);

  const head = headArr[0];

  if (!head) {
    return { content: [{ type: 'text', text: 'Task has no ledger history.' }] };
  }

  const taskArr = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  const taskRow = taskArr[0];

  if (!taskRow) {
    return { content: [{ type: 'text', text: 'Task not found in DB.' }] };
  }

  const featureArr = await db.select().from(features).where(eq(features.id, taskRow.featureId)).limit(1);
  const featureRow = featureArr[0];

  if (featureRow) {
    const projectArr = await db.select().from(projects).where(eq(projects.id, featureRow.projectId)).limit(1);
    const projectRow = projectArr[0];
    if (projectRow) {
      templateManager.initialize(projectRow.rootPath);
    }
  }

  const ctx = { task: taskRow, exchange: head };

  let templateName = 'briefing_unknown_phase.mx';
  switch (head.type) {
    case 'STAGE_DIRECTIVE':
      templateName = 'briefing_awaiting_implementation_report.mx';
      break;
    case 'IMPLEMENTATION_REPORT':
    case 'COMMENTS_RESOLUTION':
      templateName = 'briefing_awaiting_review.mx';
      break;
    case 'REJECTION':
      templateName = 'briefing_awaiting_comments_resolution.mx';
      break;
    case 'APPROVAL':
      templateName = 'briefing_completed.mx';
      break;
  }

  const text = templateManager.render(templateName, ctx);
  return {
    content: [{ type: 'text', text }],
  };
}
