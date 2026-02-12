/**
 * Single entry: main(command, args).
 * Pure transformer + effect interpretation. All I/O here.
 */

import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import type { AppState, FSMInput, RelayState, TaskInfo } from './state';
import type { Effect } from './effects';
import { createInitialState } from './state';
import { fsm } from './fsm';
import { validateReport, validateDirective } from './validator';
import {
  findRelayRoot,
  getRelayDir,
  getFeaturesDir,
  getFeatureDir,
  getArchiveDir,
  getNextExchangePath,
  getLatestExchangeToRead,
} from './resolver';
import { LockManager } from './lock';
import {
  log,
  exit,
  ensureDir,
  copyFile,
  move,
  persistState,
  writeFile,
  createTaskScaffold,
  discoverRelayRoot,
  discoverProjectRoot,
  discoverFeatures,
  discoverPathExists,
  discoverFeatureExists,
  discoverReadFile,
  discoverFsmInput,
  discoverFeatureState,
  promptConfirm,
  showHelp,
  showPromptFile,
} from './effects';

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

export interface MainContext {
  command: string;
  args: Record<string, unknown>;
  packageRoot: string;
  program: { help: () => void };
}

function getPackageRoot(): string {
  return path.join(__dirname, '..');
}

function toSlug(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Run discovery effect, return value to merge into _discovered */
async function runDiscovery(
  effect: Effect,
  state: AppState
): Promise<Partial<AppState['_discovered']>> {
  switch (effect.type) {
    case 'discover-relay-root':
      return { projectRoot: findRelayRoot() };
    case 'discover-project-root':
      return {
        projectRoot: effect.mode === 'init' ? process.cwd() : findRelayRoot(),
      };
    case 'discover-features': {
      const root = state._discovered?.projectRoot;
      if (!root || typeof root !== 'string') return {};
      const featuresDir = getFeaturesDir(root);
      if (!(await fs.pathExists(featuresDir))) return { features: [] };
      const entries = await fs.readdir(featuresDir, { withFileTypes: true });
      return {
        features: entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort(),
      };
    }
    case 'discover-path-exists':
      return { pathExists: await fs.pathExists(effect.path) };
    case 'discover-feature-exists': {
      const root = state._discovered?.projectRoot;
      if (!root || typeof root !== 'string') return {};
      return { featureExists: await fs.pathExists(getFeatureDir(root, effect.feature)) };
    }
    case 'discover-read-file': {
      if (!(await fs.pathExists(effect.path))) return { fileContent: '' };
      return { fileContent: await fs.readFile(effect.path, 'utf-8') };
    }
    case 'discover-fsm-input': {
      const featureDir = getFeatureDir(effect.projectRoot, effect.feature);
      const input = await loadFSMInput(effect.projectRoot, effect.feature, featureDir, effect.persona, effect.submit);
      return { fsmInput: input };
    }
    case 'discover-feature-state': {
      const root = state._discovered?.projectRoot;
      if (!root || typeof root !== 'string') return {};
      const featureDir = getFeatureDir(root, effect.feature);
      const st = await loadStateFromPath(path.join(featureDir, 'state.json'));
      return { featureState: st };
    }
    default:
      return {};
  }
}

interface RunEffectContext {
  state: AppState;
  projectRoot: string | null;
  packageRoot: string;
  feature?: string;
  lock?: LockManager;
  program: { help: () => void };
}

async function runEffect(
  effect: Effect,
  ctx: RunEffectContext
): Promise<{ exitCode?: number; discovered?: Partial<AppState['_discovered']> }> {
  const { state, projectRoot, packageRoot, feature } = ctx;
  const featureDir = projectRoot && feature ? getFeatureDir(projectRoot, feature) : '';
  const relayDir = projectRoot ? getRelayDir(projectRoot) : '';
  const statePath = featureDir ? path.join(featureDir, 'state.json') : '';

  if (
    effect.type === 'discover-relay-root' ||
    effect.type === 'discover-project-root' ||
    effect.type === 'discover-features' ||
    effect.type === 'discover-path-exists' ||
    effect.type === 'discover-feature-exists' ||
    effect.type === 'discover-read-file' ||
    effect.type === 'discover-fsm-input' ||
    effect.type === 'discover-feature-state'
  ) {
    const discovered = await runDiscovery(effect, state);
    return { discovered };
  }

  switch (effect.type) {
    case 'log':
      console.log(effect.message);
      break;
    case 'exit':
      return { exitCode: effect.code };
    case 'show-help':
      ctx.program.help();
      break;
    case 'ensure-dir':
      await fs.ensureDir(effect.path);
      break;
    case 'write-file':
      await fs.ensureDir(path.dirname(effect.path));
      await fs.writeFile(effect.path, effect.content);
      break;
    case 'copy-file':
      await fs.copy(effect.src, effect.dest);
      break;
    case 'move':
      await fs.ensureDir(path.dirname(effect.dest));
      await fs.move(effect.src, effect.dest);
      break;
    case 'persist-state':
      if (statePath) {
        const s = { ...effect.state, updatedAt: Date.now() };
        const tmp = statePath + '.tmp';
        await fs.ensureDir(path.dirname(statePath));
        await fs.writeJson(tmp, s, { spaces: 2 });
        await fs.rename(tmp, statePath);
      }
      break;
    case 'read-state':
      if (ctx.lock) await ctx.lock.release();
      try {
        await watchStateUntil(statePath, effect.condition);
      } finally {
        if (ctx.lock) await ctx.lock.acquire(3600000);
      }
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
    case 'create-task-scaffold':
      if (featureDir) {
        const tasksDir = path.join(featureDir, 'tasks');
        await fs.ensureDir(tasksDir);
        const filePath = path.join(tasksDir, `${effect['task-id']}.md`);
        await fs.writeFile(
          filePath,
          `# Task ${effect['task-id'].replace(/^0*/, '')}: Setup\n\n- [ ] Initialize project structure\n`
        );
      }
      break;
    case 'prompt-confirm': {
      const { confirm } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: effect.message,
        default: false,
      });
      const nextEffects = confirm ? effect.then : effect.else;
      for (const e of nextEffects) {
        const result = await runEffect(e, ctx);
        if (result.exitCode !== undefined) return result;
        if (result.discovered) {
          ctx.state = { ...ctx.state, _discovered: { ...ctx.state._discovered, ...result.discovered } };
        }
      }
      break;
    }
    case 'show-prompt-file': {
      const fallbackPath = path.join(packageRoot, 'prompts', `${effect.persona}.md`);
      const pathToRead = (await fs.pathExists(effect.path)) ? effect.path : fallbackPath;
      const content = (await fs.pathExists(pathToRead))
        ? await fs.readFile(pathToRead, 'utf-8')
        : effect.persona === 'architect'
          ? 'You are the Architect. Plan and oversee execution.'
          : 'You are the Engineer. Execute the directive.';
      console.log(content);
      console.log('\n─────────────────────────────────────────────────────────────');
      console.log(`To begin: relay ${effect.persona} ${effect.feature} pulse`);
      console.log('─────────────────────────────────────────────────────────────\n');
      break;
    }
    default:
      break;
  }
  return {};
}

async function watchStateUntil(
  statePath: string,
  condition: (s: RelayState) => boolean
): Promise<void> {
  // 1. Initial check
  let s = await loadStateFromPath(statePath);
  if (condition(s)) return;

  while (true) {
    // 2. Setup watcher
    let resolveWatch: () => void;
    // eslint-disable-next-line
    const watchPromise = new Promise<void>((r) => { resolveWatch = r; });
    const watcher = fs.watch(statePath, () => {
      watcher.close();
      resolveWatch();
    });

    // 3. Check AGAIN (race condition fix)
    s = await loadStateFromPath(statePath);
    if (condition(s)) {
      watcher.close();
      return;
    }

    // 4. Wait for watcher (if condition was still false)
    await watchPromise;
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

async function loadFSMInput(
  projectRoot: string,
  feature: string,
  featureDir: string,
  persona: 'architect' | 'engineer',
  submit: boolean
): Promise<FSMInput> {
  const state = await loadStateFromPath(path.join(featureDir, 'state.json'));
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
    if (validateDirective(raw).valid) directiveContent = raw;
  }
  let reportContent: string | null = null;
  if (reportPath && (await fs.pathExists(reportPath))) {
    const raw = await fs.readFile(reportPath, 'utf-8');
    if (validateReport(raw).valid) reportContent = raw;
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

// ─── Transformer (pure) ─────────────────────────────────────────────────────

function transformer(
  command: string,
  args: Record<string, unknown>,
  state: AppState
): [AppState, Effect[]] {
  switch (command) {
    case 'help':
      return [state, [showHelp()]];
    case 'init':
      return transformInit(state);
    case 'add':
      return transformAdd(state, args);
    case 'features':
      return transformFeatures(state);
    case 'status':
      return transformStatus(state, args);
    case 'archive':
      return transformArchive(state, args);
    case 'architect':
      return transformArchitect(state, args);
    case 'engineer':
      return transformEngineer(state, args);
    default:
      return [state, [log(`Unknown command: ${command}`), exit(1)]];
  }
}

function transformInit(state: AppState): [AppState, Effect[]] {
  const projectRoot = state._discovered?.projectRoot;
  const pathExists = state._discovered?.pathExists;

  if (projectRoot === undefined) {
    return [state, [discoverProjectRoot('init')]];
  }
  if (pathExists === undefined) {
    return [state, [discoverPathExists(getRelayDir(projectRoot as string))]];
  }
  if (pathExists) {
    return [state, [log(`Already initialized: ${getRelayDir(projectRoot as string)}`), exit(0)]];
  }
  const root = projectRoot as string;
  const relayDir = getRelayDir(root);
  const pkgRoot = getPackageRoot();
  return [
    state,
    [
      ensureDir(path.join(relayDir, 'features')),
      ensureDir(path.join(relayDir, 'archive')),
      ensureDir(path.join(relayDir, 'prompts')),
      copyFile(path.join(pkgRoot, 'prompts', 'architect.md'), path.join(relayDir, 'prompts', 'architect.md')),
      copyFile(path.join(pkgRoot, 'prompts', 'engineer.md'), path.join(relayDir, 'prompts', 'engineer.md')),
      copyFile(path.join(pkgRoot, 'templates', 'plan.template.md'), path.join(relayDir, 'plan.template.md')),
      copyFile(
        path.join(pkgRoot, 'templates', 'CODING_GUIDELINES.md'),
        path.join(relayDir, 'CODING_GUIDELINES.md')
      ),
      log(`✓ Initialized: ${relayDir}\n\nNext: relay add <feature-name>`),
      exit(0),
    ],
  ];
}

function transformAdd(state: AppState, args: Record<string, unknown>): [AppState, Effect[]] {
  const root = state._discovered?.projectRoot;
  const featureExists = state._discovered?.featureExists;
  if (root === undefined) {
    return [state, [discoverRelayRoot()]];
  }
  if (root === null) {
    return [state, [log('Error: No .relay folder found. Run relay init.'), exit(1)]];
  }
  const fileContent = state._discovered?.fileContent;
  const name = args.name as string | undefined;
  const slug = name ? toSlug(name) : '';
  if (!name) {
    return [state, [log('Usage: relay add <name>'), exit(1)]];
  }
  if (featureExists === undefined) {
    return [state, [discoverFeatureExists(slug)]];
  }
  if (featureExists) {
    return [state, [log(`Feature '${slug}' already exists.`), exit(1)]];
  }

  const relayDir = getRelayDir(root);
  const featureDir = getFeatureDir(root, slug);
  const planPath = path.join(relayDir, 'plan.template.md');
  const pkgRoot = getPackageRoot();

  if (fileContent === undefined) {
    return [state, [discoverReadFile(planPath)]];
  }
  const planTemplate = fileContent || `# ${name}\n\n## Overview\n\n[Describe feature]\n`;
  const planContent = planTemplate.replace(/\[Feature Name\]/g, name);

  const effects: Effect[] = [
    ensureDir(path.join(featureDir, 'tasks')),
    ensureDir(path.join(featureDir, 'exchange')),
    writeFile(path.join(featureDir, 'plan.md'), planContent),
    persistState(createInitialState()),
  ];
  if ((args as { custom?: boolean }).custom) {
    effects.push(
      ensureDir(path.join(featureDir, 'prompts')),
      copyFile(path.join(relayDir, 'prompts', 'architect.md'), path.join(featureDir, 'prompts', 'architect.md')),
      copyFile(path.join(relayDir, 'prompts', 'engineer.md'), path.join(featureDir, 'prompts', 'engineer.md'))
    );
  }
  effects.push(
    log(`✓ Created feature: ${slug}\n  → ${featureDir}\n\nNext: relay architect ${slug} pulse`),
    exit(0)
  );
  return [state, effects];
}

function transformFeatures(state: AppState): [AppState, Effect[]] {
  const root = state._discovered?.projectRoot;
  const features = state._discovered?.features;
  if (root === undefined || root === null) {
    return [state, [discoverRelayRoot()]];
  }
  if (features === undefined) {
    return [state, [discoverFeatures()]];
  }
  if (features.length === 0) {
    return [state, [log('No features found. Create one with: relay add <name>'), exit(0)]];
  }
  const lines: string[] = [
    '═══════════════════════════════════════',
    '             ACTIVE FEATURES           ',
    '═══════════════════════════════════════',
  ];
  for (const name of features) {
    lines.push('', `[○] ${name}`);
  }
  lines.push('', '═══════════════════════════════════════');
  return [state, [log(lines.join('\n')), exit(0)]];
}

function transformStatus(state: AppState, args: Record<string, unknown>): [AppState, Effect[]] {
  const feature = args.feature as string | undefined;
  if (!feature) {
    return [state, [log('Usage: relay status <feature>'), exit(1)]];
  }
  const root = state._discovered?.projectRoot;
  const featureExists = state._discovered?.featureExists;
  const featureState = state._discovered?.featureState;
  if (root === undefined || root === null) {
    return [state, [discoverRelayRoot()]];
  }
  if (featureExists === undefined) {
    return [state, [discoverFeatureExists(feature)]];
  }
  if (!featureExists) {
    return [state, [log(`Feature '${feature}' not found.`), exit(1)]];
  }
  if (featureState === undefined) {
    return [state, [discoverFeatureState(feature)]];
  }
  const lines = [
    '═══════════════════════════════════════',
    `         FEATURE: ${feature.toUpperCase()}`,
    '═══════════════════════════════════════',
    `Status: ${featureState.status}`,
    `Current Task: ${featureState.currentTask || 'None'}`,
    `Iteration: ${featureState.iteration}`,
    '═══════════════════════════════════════',
  ];
  return [state, [log(lines.join('\n')), exit(0)]];
}

function transformArchive(state: AppState, args: Record<string, unknown>): [AppState, Effect[]] {
  const feature = args.feature as string | undefined;
  if (!feature) {
    return [state, [log('Usage: relay archive <feature>'), exit(1)]];
  }
  const root = state._discovered?.projectRoot;
  const featureExists = state._discovered?.featureExists;
  if (root === undefined || root === null) {
    return [state, [discoverRelayRoot()]];
  }
  if (featureExists === undefined) {
    return [state, [discoverFeatureExists(feature)]];
  }
  if (!featureExists) {
    return [state, [log(`Feature '${feature}' not found.`), exit(1)]];
  }
  const featureDir = getFeatureDir(root as string, feature);
  const archiveDir = getArchiveDir(root as string);
  const archivePath = path.join(archiveDir, `${feature}-${Date.now()}`);
  return [
    state,
    [
      promptConfirm(
        `Archive feature '${feature}'?`,
        [ensureDir(archiveDir), move(featureDir, archivePath), log(`✓ Archived: ${feature}`), exit(0)],
        [log('Cancelled.'), exit(0)]
      ),
    ],
  ];
}

function transformArchitect(state: AppState, args: Record<string, unknown>): [AppState, Effect[]] {
  const feature = args.feature as string | undefined;
  const pulse = args.pulse === 'pulse';
  if (!feature || feature === 'pulse') {
    return [state, [log('Usage: relay architect <feature> pulse'), exit(1)]];
  }
  if (!pulse) {
    const root = state._discovered?.projectRoot;
    if (root === undefined || root === null) {
      return [state, [discoverRelayRoot()]];
    }
    const featureDir = getFeatureDir(root as string, feature);
    const pkgRoot = getPackageRoot();
    const promptPath = path.join(featureDir, 'prompts', 'architect.md');
    const defaultPath = path.join(pkgRoot, 'prompts', 'architect.md');
    return [state, [showPromptFile(promptPath, 'architect', feature), exit(0)]];
  }
  return runPulseTransform(state, args, 'architect');
}

function transformEngineer(state: AppState, args: Record<string, unknown>): [AppState, Effect[]] {
  const feature = args.feature as string | undefined;
  const pulse = args.pulse === 'pulse';
  if (!feature || feature === 'pulse') {
    return [state, [log('Usage: relay engineer <feature> pulse'), exit(1)]];
  }
  if (!pulse) {
    const root = state._discovered?.projectRoot;
    if (root === undefined || root === null) {
      return [state, [discoverRelayRoot()]];
    }
    const featureDir = getFeatureDir(root as string, feature);
    const pkgRoot = getPackageRoot();
    const promptPath = path.join(featureDir, 'prompts', 'engineer.md');
    return [state, [showPromptFile(promptPath, 'engineer', feature), exit(0)]];
  }
  return runPulseTransform(state, args, 'engineer');
}

function runPulseTransform(
  state: AppState,
  args: Record<string, unknown>,
  persona: 'architect' | 'engineer'
): [AppState, Effect[]] {
  const root = state._discovered?.projectRoot;
  const fsmInput = state._discovered?.fsmInput;
  if (!root || typeof root !== 'string') {
    return [state, [discoverRelayRoot()]];
  }
  const feature = args.feature as string;
  const submit = !!(args as { submit?: boolean }).submit;
  if (!fsmInput) {
    return [state, [discoverFsmInput(root, feature, persona, submit)]];
  }
  const [newState, effects] = fsm(fsmInput);
  return [newState as AppState, effects];
}

// ─── main() ─────────────────────────────────────────────────────────────────

export async function main(
  command: string,
  args: Record<string, unknown>,
  ctx: MainContext
): Promise<number> {
  const { program } = ctx;
  let state: AppState = createInitialState();
  let exitCode = 0;
  let lock: LockManager | undefined;
  const feature = (args.feature as string) || (args.name ? toSlug(args.name as string) : undefined);

  if ((command === 'architect' || command === 'engineer') && feature && args.pulse === 'pulse') {
    const root = findRelayRoot();
    if (!root) {
      console.error('Error: No .relay folder found. Run relay init.');
      return 1;
    }
    if (!(await fs.pathExists(getFeatureDir(root, feature)))) {
      console.error(`Feature '${feature}' not found.`);
      return 1;
    }
    lock = new LockManager(getFeatureDir(root, feature));
    try {
      await lock.acquire(3600000);
    } catch {
      console.error('\n🔒 [LOCKED] Another Relay process is running.\n');
      return 1;
    }
  }

  while (true) {
    const projectRoot = state._discovered?.projectRoot ?? findRelayRoot();
    const runCtx: RunEffectContext = {
      state,
      projectRoot,
      packageRoot: ctx.packageRoot,
      feature,
      lock,
      program,
    };

    const [newState, effects] = transformer(command, args, state);

    for (const effect of effects) {
      const result = await runEffect(effect, runCtx);
      if (result.discovered) {
        state = { ...state, _discovered: { ...state._discovered, ...result.discovered } };
        runCtx.state = state;
      }
      if (result.exitCode !== undefined) {
        exitCode = result.exitCode;
        break;
      }
    }

    const exitEffect = effects.find((e) => e.type === 'exit');
    if (exitEffect && exitEffect.type === 'exit') {
      exitCode = exitEffect.code;
      break;
    }
    const persistEffect = effects.find((e) => e.type === 'persist-state');
    const hadReadState = effects.some((e) => e.type === 'read-state');
    if (persistEffect && persistEffect.type === 'persist-state') {
      state = { ...persistEffect.state, _discovered: state._discovered } as AppState;
    } else {
      state = { ...newState, _discovered: state._discovered };
    }
    if (hadReadState && feature && projectRoot) {
      const featureDir = getFeatureDir(projectRoot as string, feature);
      const freshState = await loadStateFromPath(path.join(featureDir, 'state.json'));
      state = { ...freshState, _discovered: { ...state._discovered, fsmInput: undefined } } as AppState;
    }
  }

  if (lock) await lock.release();
  return exitCode;
}
