/**
 * Pure state machine: (input) => [newState, effects].
 * No I/O, no async, no mutation.
 */

import type { FSMInput, RelayState, TaskInfo } from './state';
import type { Effect } from './effects';
import {
  persistState,
  readState,
  log,
  promptUser,
  exit,
  createTaskScaffold,
} from './effects';
import { getNextExchangePath } from './resolver';

const APPROVE_REGEX = /#+\s*VERDICT\s*\n\s*APPROVE/i;

function selectNextTask(state: RelayState, tasks: TaskInfo[]): TaskInfo | null {
  if (tasks.length === 0) return null;

  if (state.currentTask && state.status !== 'approved') {
    const current = tasks.find((t) => t.id === state.currentTask);
    if (current) return current;
  }

  if (state.currentTask) {
    const idx = tasks.findIndex((t) => t.id === state.currentTask);
    if (idx !== -1 && idx < tasks.length - 1) return tasks[idx + 1];
  }

  return tasks[0];
}

function updateState(
  state: RelayState,
  updates: Partial<RelayState>
): RelayState {
  return { ...state, ...updates, updatedAt: Date.now() };
}

export function fsm(input: FSMInput): [RelayState, Effect[]] {
  const { state, persona, feature, submit, tasks, workDir } = input;

  if (persona === 'architect') {
    return runArchitectFSM(input);
  }
  return runEngineerFSM(input);
}

function runArchitectFSM(input: FSMInput): [RelayState, Effect[]] {
  const {
    state,
    feature,
    submit,
    tasks,
    reportContent,
    directiveContent,
    directivePath,
    reportPath,
    workDir,
  } = input;

  // 1. No tasks: create scaffold, prompt, exit
  if (tasks.length === 0) {
    const msg = `No tasks found. Created 001-setup.md scaffold.\nRe-run pulse to begin: relay architect ${feature} pulse`;
    return [
      state,
      [
        createTaskScaffold('001-setup'),
        persistState(state),
        promptUser(msg, `relay architect ${feature} pulse --submit`),
        exit(0),
      ],
    ];
  }

  // 2. Need to select task (none or approved)
  const nextTask = selectNextTask(state, tasks);
  if (!nextTask) {
    return [
      state,
      [log('All tasks approved!'), exit(0)],
    ];
  }

  let newState = state;
  if (!state.currentTask || state.status === 'approved') {
    newState = updateState(state, {
      currentTask: nextTask.id,
      currentTaskSlug: nextTask.slug,
      status: 'in_progress',
      lastAuthor: null,
      iteration: state.status === 'approved' ? 1 : state.iteration,
    });
  }

  const isFirstDirective = !reportContent;
  const hasValidDirective = directiveContent && directivePath;

  // 3. First directive for this task (no report yet) - architect writes initial directive
  if (isFirstDirective) {
    if (submit && hasValidDirective) {
      const { iteration } = getNextExchangePath(
        newState,
        workDir,
        'architect'
      );
      const submittedState = updateState(newState, {
        lastAuthor: 'architect',
        iteration,
        status: 'in_progress',
      });
      return [
        submittedState,
        [
          persistState(submittedState),
          readState((s) => s.lastAuthor === 'engineer'),
        ],
      ];
    }
    const { path: dirPath } = getNextExchangePath(newState, workDir, 'architect');
    const submitCmd = `relay architect ${feature} pulse --submit`;
    const [promptMsg, path] = buildArchitectPrompt(input, dirPath || directivePath, submitCmd);
    return [
      newState,
      [
        persistState(newState),
        promptUser(promptMsg, submitCmd, path),
        exit(0),
      ],
    ];
  }

  // 4. Architect reviewing report - has report, writes directive
  if (submit && hasValidDirective) {
    if (APPROVE_REGEX.test(directiveContent)) {
      const approvedState = updateState(newState, {
        status: 'approved',
        currentTask: '',
        currentTaskSlug: '',
        lastAuthor: 'architect',
      });
      return [
        approvedState,
        [persistState(approvedState), log('Task approved!'), exit(0)],
      ];
    }

    const { iteration } = getNextExchangePath(
      newState,
      workDir,
      'architect'
    );
    const submittedState = updateState(newState, {
      lastAuthor: 'architect',
      iteration,
      status: 'in_progress',
    });
    return [
      submittedState,
      [
        persistState(submittedState),
        readState((s) => s.lastAuthor === 'engineer'),
      ],
    ];
  }

  const submitCmd = `relay architect ${feature} pulse --submit`;
  const [promptMsg, p] = buildArchitectPrompt(input, directivePath, submitCmd);
  return [newState, [promptUser(promptMsg, submitCmd, p), exit(0)]];
}

function buildArchitectPrompt(
  input: FSMInput,
  directivePath: string,
  submitCmd: string
): [string, string] {
  const task = input.tasks.find((t) => t.id === input.state.currentTask);
  const msg = `Write your directive to: ${directivePath}
${task ? `\nTask: ${task.id} - ${task.title}\n---\n${task.content}\n---` : ''}
Review the Engineer's report. REJECT if any doubt. Zero trust.
When done, run: ${submitCmd}`;
  return [msg, directivePath];
}

function runEngineerFSM(input: FSMInput): [RelayState, Effect[]] {
  const {
    state,
    feature,
    submit,
    tasks,
    directiveContent,
    reportContent,
    directivePath,
    reportPath,
    workDir,
  } = input;

  // 1. No currentTask - block until architect sets it
  if (!state.currentTask || !state.currentTaskSlug) {
    return [state, [readState((s) => !!(s.currentTask && s.currentTaskSlug))]];
  }

  const task = tasks.find((t) => t.id === state.currentTask);
  if (!task) {
    return [
      state,
      [log(`Task ${state.currentTask} not found in tasks folder.`), exit(0)],
    ];
  }

  // 2. No directive yet - block until architect submits (lastAuthor === 'architect')
  if (!directiveContent) {
    return [state, [readState((s) => s.lastAuthor === 'architect')]];
  }

  const hasValidReport = reportContent && reportPath;

  // 3. Engineer submits report
  if (submit && hasValidReport) {
    const submittedState = updateState(state, {
      lastAuthor: 'engineer',
      status: 'in_progress',
    });
    return [
      submittedState,
      [
        persistState(submittedState),
        readState((s) => s.lastAuthor === 'architect'),
      ],
    ];
  }

  const submitCmd = `relay engineer ${feature} pulse --submit`;
  const promptMsg = `Write your report to: ${reportPath}
Implement task: ${task.id} - ${task.title}
---
${task.content}
---
Follow the directive exactly. When done, run: ${submitCmd}`;

  return [state, [promptUser(promptMsg, submitCmd, reportPath), exit(0)]];
}
