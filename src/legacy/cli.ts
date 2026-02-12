import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import {
    findRelayRoot,
    requireRelayRoot,
    getRelayDir,
    getFeaturesDir,
    getFeatureDir
} from './core/resolver';
import {
    listFeatures,
    getFeature,
    createFeature,
    archiveFeature,
    loadFeatureTasks,
    loadFeatureState,
    saveFeatureState,
    TaskFile
} from './core/feature';
import {
    getNextExchangePath,
    getLatestExchangeToRead,
    recordExchange
} from './core/exchange';
import { resolvePrompt } from './core/prompt-resolver';
import { resolveBootstrap } from './core/bootstrap-resolver';
import { PromptLoader } from './core/prompts';
import { RelayContext } from './core/context';
import { ConsoleLogger } from './core/logger';
import { ConsoleRelayAgent } from './core/agent';
import { StateManager } from './core/state';
import { LockManager } from './core/lock';
import { randomUUID } from 'crypto';

// Load package.json for version check
const pkg = require('../package.json');

const program = new Command();

program
    .name('relay')
    .description('Agent-to-agent coordination relay (Government Hardened)')
    .version(pkg.version);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get package root (where templates/prompts live)
// ═══════════════════════════════════════════════════════════════════════════

function getPackageRoot(): string {
    // From dist/cli.js, go up to package root
    return path.join(__dirname, '..');
}

function toSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT COMMAND
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('init')
    .description('Initialize .relay folder in current directory')
    .action(async () => {
        const root = findRelayRoot();
        if (root) {
            console.log(`Already initialized: ${getRelayDir(root)}`);
            return;
        }

        const relayDir = getRelayDir(process.cwd());
        const packageRoot = getPackageRoot();

        // Create directories
        await fs.ensureDir(path.join(relayDir, 'features'));
        await fs.ensureDir(path.join(relayDir, 'archive'));
        await fs.ensureDir(path.join(relayDir, 'prompts'));

        // Copy default prompts
        const defaultPromptsDir = path.join(packageRoot, 'prompts');
        if (await fs.pathExists(defaultPromptsDir)) {
            await fs.copy(
                path.join(defaultPromptsDir, 'architect.md'),
                path.join(relayDir, 'prompts', 'architect.md')
            );
            await fs.copy(
                path.join(defaultPromptsDir, 'engineer.md'),
                path.join(relayDir, 'prompts', 'engineer.md')
            );
        }

        // Copy plan template
        const templatePath = path.join(packageRoot, 'templates', 'plan.template.md');
        if (await fs.pathExists(templatePath)) {
            await fs.copy(templatePath, path.join(relayDir, 'plan.template.md'));
        }

        // Copy bootstrap template (ESM)
        const bootstrapPath = path.join(packageRoot, 'templates', 'bootstrap.template.js');
        if (await fs.pathExists(bootstrapPath)) {
            // Copy to .mjs to ensure Node treats it as ESM regardless of package.json type
            await fs.copy(bootstrapPath, path.join(relayDir, 'bootstrap.mjs'));
        }

        console.log(`✓ Initialized: ${relayDir}`);
        console.log(`\nContents:`);
        console.log(`  prompts/engineer.md   - Engineer system prompt`);
        console.log(`  plan.template.md      - Template for feature plans`);
        console.log(`  bootstrap.mjs         - Pipeline customization`);

        // Copy Coding Guidelines
        const guidelinesPath = path.join(packageRoot, 'templates', 'CODING_GUIDELINES.md');
        if (await fs.pathExists(guidelinesPath)) {
            await fs.copy(guidelinesPath, path.join(relayDir, 'CODING_GUIDELINES.md'));
            console.log(`  CODING_GUIDELINES.md  - Project coding standards`);
        }


        // Check for dependency
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (await fs.pathExists(pkgPath)) {
            try {
                const pkg = await fs.readJson(pkgPath);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
                if (!deps['orchestrator-relay']) {
                    console.log(`\n⚠️  IMPORTANT: Install the package to use the default bootstrap:`);
                    console.log(`   npm install -D orchestrator-relay`);
                    console.log(`   (or yarn add -D / pnpm add -D)`);
                }
            } catch (e) {
                // Ignore error reading package.json
            }
        }

        console.log(`\nNext: relay add <feature-name>`);
    });

// ═══════════════════════════════════════════════════════════════════════════
// ADD COMMAND (Create Feature)
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('add <name>')
    .description('Create a new feature')
    .option('--custom', 'Include feature-level prompts for customization')
    .action(async (name: string, options: { custom?: boolean }) => {
        const projectRoot = requireRelayRoot();
        const slug = toSlug(name);
        const featureDir = getFeatureDir(projectRoot, slug);
        const relayDir = getRelayDir(projectRoot);
        const packageRoot = getPackageRoot();

        if (await fs.pathExists(featureDir)) {
            console.error(`Feature '${slug}' already exists.`);
            process.exit(1);
        }

        // Create directories
        await fs.ensureDir(path.join(featureDir, 'tasks'));
        await fs.ensureDir(path.join(featureDir, 'exchange'));

        // Copy plan template (priority: .relay > default)
        let planTemplate: string;
        const relayTemplate = path.join(relayDir, 'plan.template.md');
        const defaultTemplate = path.join(packageRoot, 'templates', 'plan.template.md');

        if (await fs.pathExists(relayTemplate)) {
            planTemplate = await fs.readFile(relayTemplate, 'utf-8');
        } else if (await fs.pathExists(defaultTemplate)) {
            planTemplate = await fs.readFile(defaultTemplate, 'utf-8');
        } else {
            planTemplate = `# ${name}\n\n## Overview\n\n[Describe feature]\n`;
        }

        // Replace placeholder with actual name
        const plan = planTemplate.replace(/\[Feature Name\]/g, name);
        await fs.writeFile(path.join(featureDir, 'plan.md'), plan);

        // Create initial state
        const state = {
            currentTask: '',
            currentTaskSlug: '',
            iteration: 0,
            lastAuthor: null,
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await fs.writeJson(path.join(featureDir, 'state.json'), state, { spaces: 2 });

        // If --custom, copy prompts from .relay/prompts
        if (options.custom) {
            await fs.ensureDir(path.join(featureDir, 'prompts'));
            const relayPrompts = path.join(relayDir, 'prompts');

            if (await fs.pathExists(path.join(relayPrompts, 'architect.md'))) {
                await fs.copy(
                    path.join(relayPrompts, 'architect.md'),
                    path.join(featureDir, 'prompts', 'architect.md')
                );
            }
            if (await fs.pathExists(path.join(relayPrompts, 'engineer.md'))) {
                await fs.copy(
                    path.join(relayPrompts, 'engineer.md'),
                    path.join(featureDir, 'prompts', 'engineer.md')
                );
            }
        }

        console.log(`✓ Created feature: ${slug}`);
        console.log(`  → ${featureDir}`);
        console.log(`\nCreated:`);
        console.log(`  plan.md       - Edit with architectural plan`);
        console.log(`  tasks/        - Add task files (001-xxx.md)`);
        console.log(`  exchange/     - Agent communication`);
        if (options.custom) {
            console.log(`  prompts/      - Feature-specific prompts`);
        }
        console.log(`\nNext:`);
        console.log(`  1. Edit plan.md`);
        console.log(`  2. Create tasks in tasks/ (e.g., 001-setup.md)`);
        console.log(`  3. Run: relay architect`);
    });

// ═══════════════════════════════════════════════════════════════════════════
// LIST COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('features')
    .description('List active features')
    .action(async () => {
        const projectRoot = requireRelayRoot();
        const features = await listFeatures(projectRoot);

        if (features.length === 0) {
            console.log('No features found.');
            console.log('Create one with: relay add <name>');
            return;
        }

        console.log('═══════════════════════════════════════');
        console.log('             ACTIVE FEATURES           ');
        console.log('═══════════════════════════════════════');

        for (const name of features) {
            const state = await loadFeatureState(projectRoot, name);
            const tasks = await loadFeatureTasks(projectRoot, name);

            const statusIcon = state.status === 'approved' ? '✓' :
                state.status === 'in_progress' ? '→' : '○';

            console.log(`\n[${statusIcon}] ${name}`);
            console.log(`    Status: ${state.status}`);
            console.log(`    Tasks: ${tasks.length}`);
            if (state.currentTask) {
                console.log(`    Current: ${state.currentTask} (iter ${state.iteration})`);
            }
        }

        console.log('\n═══════════════════════════════════════');
    });

program
    .command('status <feature>')
    .description('Show feature status')
    .action(async (featureName: string) => {
        const projectRoot = requireRelayRoot();

        try {
            const feature = await getFeature(projectRoot, featureName);

            console.log('═══════════════════════════════════════');
            console.log(`         FEATURE: ${featureName.toUpperCase()}`);
            console.log('═══════════════════════════════════════');
            console.log(`Status: ${feature.state.status}`);
            console.log(`Current Task: ${feature.state.currentTask || 'None'}`);
            console.log(`Iteration: ${feature.state.iteration}`);
            console.log(`Last Author: ${feature.state.lastAuthor || 'None'}`);
            console.log(`Plan: ${feature.plan ? 'Yes' : 'Missing!'}`);

            console.log('\nTasks:');
            for (const task of feature.tasks) {
                const isCurrent = task.id === feature.state.currentTask;
                const marker = isCurrent ? ' ◀ CURRENT' : '';
                console.log(`  [${task.id}] ${task.title}${marker}`);
            }

            console.log('═══════════════════════════════════════');
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

// ═══════════════════════════════════════════════════════════════════════════
// AGENT COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('architect [feature] [pulse]')
    .description('Run architect agent')
    .option('--submit', 'Submit the directive (advance state)')
    .action(async (featureArg?: string, pulseArg?: string, options?: { submit?: boolean }) => {
        const projectRoot = requireRelayRoot();
        const features = await listFeatures(projectRoot);

        if (features.length === 0) {
            console.error('No features found. Create one with: relay add <name>');
            process.exit(1);
        }

        let featureName = featureArg;
        if (!featureName) {
            // Ask for feature
            const answer = await inquirer.prompt({
                type: 'input',
                name: 'featureName',
                message: 'FEATURE?',
                validate: (input: string) => features.includes(input) || `Feature '${input}' not found`
            });
            featureName = answer.featureName;
        }

        if (!features.includes(featureName!)) {
            // Check if featureArg was actually "pulse" (user ran: relay architect pulse)
            if (featureName === 'pulse') {
                console.error('Error: You must specify a feature name before "pulse".');
                console.error('Usage: relay architect <feature> pulse');
                process.exit(1);
            }
            console.error(`Feature '${featureName}' not found.`);
            process.exit(1);
        }

        const featureDir = getFeatureDir(projectRoot, featureName!);
        const isPulse = pulseArg === 'pulse' || featureName === 'pulse'; // Safety check

        // ══════════════════════════════════════════════════════════════════════
        // MODE 1: ACTIVATION (No Pulse)
        // ══════════════════════════════════════════════════════════════════════
        if (!isPulse) {
            const loader = new PromptLoader(featureDir);
            let promptContent = '';

            try {
                if (await loader.exists('architect')) {
                    promptContent = await loader.load('architect');
                } else {
                    // Fallback to default
                    const defaultPromptPath = path.join(getPackageRoot(), 'prompts', 'architect.md');
                    if (await fs.pathExists(defaultPromptPath)) {
                        promptContent = await fs.readFile(defaultPromptPath, 'utf-8');
                    } else {
                        promptContent = "You are the Architect. Plan and oversee execution.";
                    }
                }
            } catch (e: any) {
                console.error(`Error loading prompt: ${e.message}`);
                process.exit(1);
            }

            console.log(promptContent);
            console.log('\n───────────────────────────────────────────────────────────────────────────────');
            console.log(`To begin working on ${featureName}, execute: relay architect ${featureName} pulse`);
            console.log('───────────────────────────────────────────────────────────────────────────────\n');
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // MODE 2: PULSE (Execution Loop)
        // ══════════════════════════════════════════════════════════════════════

        // 🔒 ACQUIRE LOCK
        const lock = new LockManager(featureDir);
        try {
            await lock.acquire(2000); // 2s timeout
        } catch (e: any) {
            console.error(`\n🔒 [LOCKED] Failed to acquire lock for feature '${featureName}'.`);
            console.error(`   Another Relay process is running.`);
            process.exit(1);
        }

        try {
            const feature = await getFeature(projectRoot, featureName!);

            // Load persistence
            const stateManager = new StateManager(featureDir);
            const memory = await stateManager.load();

            // Resolve Current Task (Lookup logic is now in standard steps, but we need basic info for context)
            let currentTask = null;
            if (memory.currentTask) {
                currentTask = feature.tasks.find(t => t.id === memory.currentTask);
            }

            // --- CONTEXT HEADER ---
            console.log('\n=== PULSE: ARCHITECT ===');
            console.log(`Feature: ${featureName}`);
            console.log(`Status:  ${memory.status}`);
            console.log(`Task:    ${currentTask ? `${currentTask.id} - ${currentTask.title}` : '(None / Auto-Select)'}`);
            if (currentTask) {
                console.log(`Path:    ${currentTask.path}`);
            }
            console.log('========================\n');


            // Get report path (for review context)
            const reportPath = await getLatestExchangeToRead(projectRoot, featureName!, 'architect');

            // Get next exchange path
            // If no current task, we can't determine exchange path yet. 
            // The pipeline will handle this after lookupTask updates the state.
            // But we need safe defaults for paths object.

            // We'll calculate paths dynamically inside steps or assume safe defaults here
            let exchangePath = '';
            let iteration = memory.iteration;

            if (memory.currentTask && memory.currentTaskSlug) {
                const result = await getNextExchangePath(
                    projectRoot, featureName!, 'architect'
                ).catch(() => ({ path: '', iteration: 1 }));
                exchangePath = result.path;
                iteration = result.iteration;
            }

            // Update memory
            memory.lastAuthor = 'architect';
            memory.status = 'in_progress';
            // Only update iteration if we have a task context
            if (memory.currentTask) {
                if (memory.lastAuthor !== 'architect') {
                    memory.iteration = iteration;
                }
            }
            await stateManager.save(memory);

            const ctx: RelayContext = {
                id: randomUUID(),
                persona: 'architect',
                memory,
                logger: new ConsoleLogger(),
                agent: new ConsoleRelayAgent(new ConsoleLogger(), 'architect'),
                args: {
                    feature: featureName!,
                    submit: options?.submit
                },
                paths: {
                    workDir: featureDir,
                    directiveFile: exchangePath || '',
                    reportFile: reportPath || ''
                },
                currentTask: currentTask || undefined,
                plan: feature.plan || '',
                featureState: memory,
                lock // Pass lock for yielding
            };

            // Mark system prompt as run so it skips in pipeline
            ctx.memory.hasRunSystemPrompt = true;

            // Resolve Bootstrap
            const bootstrap = await resolveBootstrap(projectRoot, featureName!);
            // console.log(`\n[BOOTSTRAP] Loaded from: ${bootstrap.path}`);

            // Execute Pipeline
            try {
                await bootstrap.module.architect(ctx);
            } catch (e: any) {
                console.error(`\n[ERROR] Pipeline failed: ${e.message}`);
                process.exit(1);
            } finally {
                // Persist any state changes made during execution
                await stateManager.save(memory);
            }

        } finally {
            // 🔓 RELEASE LOCK
            await lock.release();
        }
    });

program
    .command('engineer [feature] [pulse]')
    .description('Run engineer agent')
    .option('--submit', 'Submit the report (advance state)')
    .action(async (featureArg?: string, pulseArg?: string, options?: { submit?: boolean }) => {
        const projectRoot = requireRelayRoot();
        const features = await listFeatures(projectRoot);

        if (features.length === 0) {
            console.error('No features found.');
            process.exit(1);
        }

        let featureName = featureArg;
        if (!featureName) {
            // Ask for feature
            const answer = await inquirer.prompt({
                type: 'input',
                name: 'featureName',
                message: 'FEATURE?',
                validate: (input: string) => features.includes(input) || `Feature '${input}' not found`
            });
            featureName = answer.featureName;
        }

        if (!features.includes(featureName!)) {
            if (featureName === 'pulse') {
                console.error('Error: You must specify a feature name before "pulse".');
                console.error('Usage: relay engineer <feature> pulse');
                process.exit(1);
            }
            console.error(`Feature '${featureName}' not found.`);
            process.exit(1);
        }

        const featureDir = getFeatureDir(projectRoot, featureName!);
        const isPulse = pulseArg === 'pulse' || featureName === 'pulse'; // Safety check

        // ══════════════════════════════════════════════════════════════════════
        // MODE 1: ACTIVATION (No Pulse)
        // ══════════════════════════════════════════════════════════════════════
        if (!isPulse) {
            const loader = new PromptLoader(featureDir);
            let promptContent = '';

            try {
                if (await loader.exists('engineer')) {
                    promptContent = await loader.load('engineer');
                } else {
                    // Fallback to default
                    const defaultPromptPath = path.join(getPackageRoot(), 'prompts', 'engineer.md');
                    if (await fs.pathExists(defaultPromptPath)) {
                        promptContent = await fs.readFile(defaultPromptPath, 'utf-8');
                    } else {
                        promptContent = "You are the Engineer. Execute the directive.";
                    }
                }
            } catch (e: any) {
                console.error(`Error loading prompt: ${e.message}`);
                process.exit(1);
            }

            console.log(promptContent);
            console.log('\n───────────────────────────────────────────────────────────────────────────────');
            console.log(`To begin working on ${featureName}, execute: relay engineer ${featureName} pulse`);
            console.log('───────────────────────────────────────────────────────────────────────────────\n');
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // MODE 2: PULSE (Execution Loop)
        // ══════════════════════════════════════════════════════════════════════

        // 🔒 ACQUIRE LOCK
        const lock = new LockManager(featureDir);
        try {
            await lock.acquire(2000); // 2s timeout
        } catch (e: any) {
            console.error(`\n🔒 [LOCKED] Failed to acquire lock for feature '${featureName}'.`);
            console.error(`   Another Relay process is running.`);
            process.exit(1);
        }

        try {
            const feature = await getFeature(projectRoot, featureName!);
            const stateManager = new StateManager(featureDir);
            const memory = await stateManager.load();

            // Ensure state is valid (Engineer cannot run if no task is selected by Architect/System)
            // But with auto-task selection, Architect runs first. Engineer should wait.
            // If architect hasn't run, status might be pending, but currentTask might be empty.
            if (!memory.currentTask) {
                console.error('No current task selected. Architect must run first to select/approve a task.');
                process.exit(1);
            }

            const task = feature.tasks.find(t => t.id === memory.currentTask);
            if (!task) {
                console.error(`Task ${memory.currentTask} not found in tasks folder.`);
                process.exit(1);
            }

            // --- CONTEXT HEADER ---
            console.log('\n=== PULSE: ENGINEER ===');
            console.log(`Feature: ${featureName}`);
            console.log(`Status:  ${memory.status}`);
            console.log(`Task:    ${task.id} - ${task.title}`);
            console.log(`Path:    ${task.path}`);
            console.log('=======================\n');

            // Directive to read
            const directivePath = await getLatestExchangeToRead(projectRoot, featureName!, 'engineer');

            if (!directivePath || !await fs.pathExists(directivePath)) {
                console.log('\n═══════════════════════════════════════');
                console.log('         WAITING FOR DIRECTIVE          ');
                console.log('═══════════════════════════════════════');
                console.log(`\nNo directive found for ${featureName!}.`);
                console.log('Architect must first run: relay architect');
                console.log('═══════════════════════════════════════\n');
            }

            // If directive missing, calculate expected path
            let targetDirectivePath = directivePath;
            if (!targetDirectivePath) {
                // Predict: <taskId>-<iter>-architect-<slug>.md
                targetDirectivePath = path.join(featureDir, 'exchange',
                    `${task.id}-${String(memory.iteration).padStart(3, '0')}-architect-${task.slug}.md`
                );
            }

            // Get report path
            const { path: reportPath, iteration } = await getNextExchangePath(
                projectRoot, featureName!, 'engineer'
            );

            // Update memory
            memory.lastAuthor = 'engineer';
            memory.iteration = iteration;
            await stateManager.save(memory);

            const ctx: RelayContext = {
                id: randomUUID(),
                persona: 'engineer',
                memory,
                logger: new ConsoleLogger(),
                agent: new ConsoleRelayAgent(new ConsoleLogger(), 'engineer'),
                args: {
                    feature: featureName!,
                    submit: options?.submit
                },
                paths: {
                    workDir: featureDir,
                    directiveFile: targetDirectivePath || '',
                    reportFile: reportPath || ''
                },
                currentTask: task, // No "as any"!
                plan: feature.plan || '',
                featureState: memory,
                lock // Pass lock for yielding
            };

            // Mark system prompt as run
            ctx.memory.hasRunSystemPrompt = true;

            // Resolve Bootstrap
            const bootstrap = await resolveBootstrap(projectRoot, featureName!);
            // console.log(`\n[BOOTSTRAP] Loaded from: ${bootstrap.path}`);

            // Execute Pipeline
            try {
                await bootstrap.module.engineer(ctx);
            } catch (e: any) {
                console.error(`\n[ERROR] Pipeline failed: ${e.message}`);
                process.exit(1);
            } finally {
                // Persist any state changes made during execution
                await stateManager.save(memory);
            }

        } finally {
            // 🔓 RELEASE LOCK
            await lock.release();
        }
    });

// ═══════════════════════════════════════════════════════════════════════════
// ARCHIVE COMMAND
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('archive <feature>')
    .description('Archive a feature')
    .action(async (featureName: string) => {
        const projectRoot = requireRelayRoot();

        const { confirm } = await inquirer.prompt({
            type: 'confirm',
            name: 'confirm',
            message: `Archive feature '${featureName}'?`,
            default: false
        });

        if (!confirm) {
            console.log('Cancelled.');
            return;
        }

        try {
            await archiveFeature(projectRoot, featureName);
            console.log(`✓ Archived: ${featureName}`);
        } catch (e: any) {
            console.error(`Error: ${e.message}`);
            process.exit(1);
        }
    });

program.parse(process.argv);
