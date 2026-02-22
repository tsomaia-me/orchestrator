/**
 * Integration test: await tools timeout and success scenarios.
 * Uses temp DB and short timeout. Run: npm run test:integration
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const testDbPath = path.join('/tmp', `relay-test-${Date.now()}.db`);
process.env.RELAY_DB_PATH = testDbPath;
process.env.RELAY_AWAIT_TIMEOUT_MS = '200';

// Create fresh DB with schema
execSync('npx drizzle-kit push --force', {
  env: { ...process.env, RELAY_DB_PATH: testDbPath },
  stdio: 'pipe',
});

const { db } = require('../src/db/index');
const { projects, features, tasks, exchanges } = require('../src/db/schema');
const awaitEngineerUpdate = require('../src/tools/core/await_engineer_update').default;
const awaitReviewerUpdate = require('../src/tools/core/await_reviewer_update').default;
const postImplementationReport = require('../src/tools/reports/post_implementation_report').default;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  OK: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

async function setup(): Promise<{ projectId: string; featureId: string; taskId: string }> {
  const projectId = 'proj_test' + Date.now();
  const featureId = 'feat_test' + Date.now();
  const taskId = 'task_test' + Date.now();

  await db.insert(projects).values({
    id: projectId,
    name: 'Test',
    rootPath: path.join('/tmp', 'relay-test-' + Date.now()),
    purpose: 'Test',
    businessGoals: [],
    createdAt: new Date(),
  });

  await db.insert(features).values({
    id: featureId,
    projectId,
    name: 'Test Feature',
    technicalSpecs: '',
    acceptanceCriteria: [],
    status: 'PLANNING',
    createdAt: new Date(),
  });

  await db.insert(tasks).values({
    id: taskId,
    featureId,
    objective: 'Test',
    requirements: [],
    constraints: [],
    createdAt: new Date(),
  });

  const genesisPayload = { directive: 'Genesis', spec: { objective: 'Test ' + Date.now(), requirements: [], constraints: [] } };
  const genesisHash = crypto.createHash('sha256').update(JSON.stringify(genesisPayload)).digest('hex');

  await db.insert(exchanges).values({
    id: 'exc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10),
    taskId,
    type: 'STAGE_DIRECTIVE',
    author: 'planner',
    parentHash: null,
    hash: genesisHash,
    payload: genesisPayload,
    createdAt: new Date(),
  });

  return { projectId, featureId, taskId };
}

async function run() {
  console.log('\n--- Integration: await timeout and success ---\n');

  const { taskId } = await setup();

  // 1. Timeout: Reviewer waits, Engineer never posts
  console.log('Test 1: Reviewer await_engineer_update times out');
  const reviewerResult = await (awaitEngineerUpdate.handler as any)({ taskId });
  const reviewerText = reviewerResult.content[0].text;
  assert(reviewerText.includes('timed out'), 'Reviewer gets timeout message');
  assert(reviewerText.includes('second'), 'Message mentions seconds');

  // 2. Timeout: Engineer waits, Reviewer never posts (need task with IMPLEMENTATION_REPORT)
  await (postImplementationReport.handler as any)({
    taskId,
    report: {
      files_modified: [],
      self_review_status: 'manually_reviewed_and_confirmed',
      checks: [{ checkId: 'build', status: 'passed', command: 'echo ok', relative_path: '.' }],
      coverage_status: 'new_functionality_fully_covered',
      implementation_status: 'fully_implemented',
      implementation_notes: 'Done',
      responsibility_ownership: 'I_the_engineer_am_responsible',
    },
  });

  console.log('Test 2: Engineer await_reviewer_update times out');
  const engineerResult = await (awaitReviewerUpdate.handler as any)({ taskId });
  const engineerText = engineerResult.content[0].text;
  assert(engineerText.includes('timed out'), 'Engineer gets timeout message');

  // 3. Success: Engineer posts, Reviewer's await resolves
  const { taskId: taskId3 } = await setup();
  const awaitPromise = (awaitEngineerUpdate.handler as any)({ taskId: taskId3 });
  await new Promise((r) => setTimeout(r, 100));
  await (postImplementationReport.handler as any)({
    taskId: taskId3,
    report: {
      files_modified: [],
      self_review_status: 'manually_reviewed_and_confirmed',
      checks: [{ checkId: 'build', status: 'passed', command: 'echo ok', relative_path: '.' }],
      coverage_status: 'new_functionality_fully_covered',
      implementation_status: 'fully_implemented',
      implementation_notes: 'Done',
      responsibility_ownership: 'I_the_engineer_am_responsible',
    },
  });
  const successResult = await awaitPromise;
  const successText = successResult.content[0].text;
  assert(!successText.includes('timed out'), 'Reviewer gets briefing (no timeout)');
  assert(successText.length > 50, 'Briefing contains substantial content');

  console.log(`\n--- ${passed} passed, ${failed} failed ---\n`);
  if (failed > 0) process.exit(1);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch (_) {}
  });
