/**
 * Effect interpreter and FSM runner.
 * All I/O happens here; FSM stays pure.
 */

import fs from 'fs-extra';
import path from 'path';
import type { FSMInput, RelayState, TaskInfo } from './state';
import type { Effect } from './effects';
import { fsm } from './fsm';
import { createInitialState } from './state';
import { validateReport, validateDirective } from './validator';
import {
  getFeatureDir,
  getNextExchangePath,
  getLatestExchangeToRead,
} from './resolver';
import type { LockManager } from './lock';

const REPORT_TEMPLATE = `# REPORT

Target: {{taskId}}
# STATUS
[COMPLETED | FAILED | BLOCKED]

## CHANGES
- 

## VERIFICATION
- 

## ISSUES
- None
`;

const DIRECTIVE_TEMPLATE = `# DIRECTIVE

Target: {{taskId}}

## EXECUTE
1. 

## CRITIQUE (If Rejecting)
1. 

# VERDICT
[APPROVE | REJECT]
`;

export interface RunOptions {
  projectRoot: string;
  feature: string;
  persona: 'architect' | 'engineer';
  submit: boolean;
  lock?: LockManager;
}

export async function run(opts: RunOptions): Promise<void> {
  const featureDir = getFeatureDir(opts.projectRoot, opts.feature);
  let input = await loadFSMInput(opts.projectRoot, opts.feature, featureDir, opts.persona, opts.submit);

  while (true) {
    const [newState, effects] = fsm(input);

    for (const effect of effects) {
      await processEffect(effect, featureDir, opts.feature, opts.lock);
    }

    if (effects.some((e) => e.type === 'exit')) {
      break;
    }

    input = await loadFSMInputWithState(
      opts.projectRoot,
      opts.feature,
      featureDir,
      opts.persona,
      opts.submit,
      newState
    );
  }
}

async function loadFSMInput(
  projectRoot: string,
  feature: string,
  featureDir: string,
  persona: 'architect' | 'engineer',
  submit: boolean
): Promise<FSMInput> {
  const state = await loadState(featureDir);
  return loadFSMInputWithState(
    projectRoot,
    feature,
    featureDir,
    persona,
    submit,
    state
  );
}

async function loadFSMInputWithState(
  projectRoot: string,
  feature: string,
  featureDir: string,
  persona: 'architect' | 'engineer',
  submit: boolean,
  state: RelayState
): Promise<FSMInput> {
  const tasks = await loadTasks(featureDir);
  const planContent = await loadPlan(featureDir);

  const directivePath =
    persona === 'architect'
      ? getNextExchangePath(state, featureDir, 'architect').path
      : getLatestExchangeToRead(state, featureDir, 'engineer') || '';

  const reportPath =
    persona === 'architect'
      ? getLatestExchangeToRead(state, featureDir, 'architect') || ''
      : getNextExchangePath(state, featureDir, 'engineer').path;

  let directiveContent: string | null = null;
  if (directivePath && (await fs.pathExists(directivePath))) {
    const raw = await fs.readFile(directivePath, 'utf-8');
    const result = validateDirective(raw);
    if (result.valid) directiveContent = raw;
  }

  let reportContent: string | null = null;
  if (reportPath && (await fs.pathExists(reportPath))) {
    const raw = await fs.readFile(reportPath, 'utf-8');
    const result = validateReport(raw);
    if (result.valid) reportContent = raw;
  }

  return {
    state,
    persona,
    feature,
    submit,
    planContent,
    tasks,
    directiveContent,
    reportContent,
    directivePath,
    reportPath,
    workDir: featureDir,
    projectRoot,
  };
}

async function loadState(featureDir: string): Promise<RelayState> {
  return loadStateFromPath(path.join(featureDir, 'state.json'));
}

async function loadTasks(featureDir: string): Promise<TaskInfo[]> {
  const tasksDir = path.join(featureDir, 'tasks');
  if (!(await fs.pathExists(tasksDir))) return [];

  const files = (await fs.readdir(tasksDir))
    .filter((f) => /^\d{3}-.*\.md$/.test(f))
    .sort();

  const tasks: TaskInfo[] = [];
  for (const filename of files) {
    const filePath = path.join(tasksDir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    const match = filename.match(/^(\d{3})-(.+)\.md$/);
    if (!match) continue;
    const [, id, slug] = match;
    const titleMatch = content.match(/^# Task \d+:\s*(.+)$/m);
    tasks.push({
      id,
      slug,
      filename,
      title: titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' '),
      content,
      path: filePath,
    });
  }
  return tasks;
}

async function loadPlan(featureDir: string): Promise<string | null> {
  const planPath = path.join(featureDir, 'plan.md');
  if (!(await fs.pathExists(planPath))) return null;
  return fs.readFile(planPath, 'utf-8');
}

async function processEffect(
  effect: Effect,
  featureDir: string,
  feature: string,
  lock?: LockManager
): Promise<void> {
  switch (effect.type) {
    case 'persist-state':
      await persistStateAtomic(path.join(featureDir, 'state.json'), effect.state);
      break;
    case 'write-file':
      await fs.ensureDir(path.dirname(effect.path));
      await fs.writeFile(effect.path, effect.content);
      break;
    case 'read-state':
      if (lock) await lock.release();
      try {
        await processReadState(
          path.join(featureDir, 'state.json'),
          effect.condition
        );
      } finally {
        if (lock) await lock.acquire(5000);
      }
      break;
    case 'log':
      console.log(effect.message);
      break;
    case 'prompt-user':
      if (effect.path && !(await fs.pathExists(effect.path))) {
        const match = path.basename(effect.path).match(/^(\d{3})-/);
        const taskId = match ? match[1] : '001';
        const template = effect.path.includes('-architect-')
          ? DIRECTIVE_TEMPLATE.replace(/\{\{taskId\}\}/g, taskId)
          : REPORT_TEMPLATE.replace(/\{\{taskId\}\}/g, taskId);
        await fs.ensureDir(path.dirname(effect.path));
        await fs.writeFile(effect.path, template);
      }
      console.log('\n' + effect.message + '\n');
      break;
    case 'exit':
      break;
    case 'create-task-scaffold':
      await createTaskScaffold(featureDir, effect['task-id']);
      break;
    default:
      break;
  }
}

async function persistStateAtomic(statePath: string, state: RelayState): Promise<void> {
  const tmpPath = statePath + '.tmp';
  state.updatedAt = Date.now();
  await fs.ensureDir(path.dirname(statePath));
  await fs.writeJson(tmpPath, state, { spaces: 2 });
  await fs.rename(tmpPath, statePath);
}

async function createTaskScaffold(featureDir: string, taskId: string): Promise<void> {
  const tasksDir = path.join(featureDir, 'tasks');
  await fs.ensureDir(tasksDir);
  const filePath = path.join(tasksDir, `${taskId}.md`);
  const content = `# Task ${taskId.replace(/^0*/, '')}: Setup\n\n- [ ] Initialize project structure\n`;
  await fs.writeFile(filePath, content);
}

async function processReadState(
  statePath: string,
  condition: (state: RelayState) => boolean
): Promise<void> {
  while (true) {
    const state = await loadStateFromPath(statePath);
    if (condition(state)) return;
    await watchForChange(statePath);
  }
}

async function loadStateFromPath(statePath: string): Promise<RelayState> {
  if (!(await fs.pathExists(statePath))) return createInitialState();
  const data = await fs.readJson(statePath);
  return {
    currentTask: data.currentTask ?? '',
    currentTaskSlug: data.currentTaskSlug ?? '',
    iteration: data.iteration ?? 0,
    lastAuthor: data.lastAuthor ?? null,
    status: data.status ?? 'pending',
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

function watchForChange(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const watcher = fs.watch(filePath, () => {
      watcher.close();
      resolve();
    });
  });
}
