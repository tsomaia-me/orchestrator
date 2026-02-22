import path from 'path';
import { db } from './db';

let initializedRoot: string | null = null;

export function initialize(projectRoot: string): void {
  const resolvedRoot = path.resolve(
    projectRoot || process.env.RELAY_ROOT || process.cwd(),
  );

  initializedRoot = resolvedRoot;
}

export function getProjectRoot(): string {
  return initializedRoot || process.env.RELAY_ROOT || process.cwd();
}

export async function getProjectRootForTask(taskId: string): Promise<string> {
  const taskRow = await db.query.tasks.findFirst({
    where: (tasks, { eq }) => eq(tasks.id, taskId),
  });
  if (!taskRow) return getProjectRoot();
  const featureRow = await db.query.features.findFirst({
    where: (features, { eq }) => eq(features.id, taskRow.featureId),
  });
  if (!featureRow) return getProjectRoot();
  const projectRow = await db.query.projects.findFirst({
    where: (projects, { eq }) => eq(projects.id, featureRow.projectId),
  });
  if (!projectRow) return getProjectRoot();
  return projectRow.rootPath;
}
