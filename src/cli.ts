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

const program = new Command();

program
    .name('relay')
    .description('Agent-to-agent coordination relay')
    .version('2.0.0');

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

        // Copy compiled bootstrap
        const bootstrapPath = path.join(packageRoot, 'dist', 'bootstrap.js');
        if (await fs.pathExists(bootstrapPath)) {
            await fs.copy(bootstrapPath, path.join(relayDir, 'bootstrap.js'));
        }

        console.log(`✓ Initialized: ${relayDir}`);
        console.log(`\nContents:`);
        console.log(`  prompts/architect.md  - Architect system prompt`);
        console.log(`  prompts/engineer.md   - Engineer system prompt`);
        console.log(`  plan.template.md      - Template for feature plans`);
        console.log(`  bootstrap.js          - Pipeline customization`);
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
    .command('architect')
    .description('Run architect agent')
    .action(async () => {
        const projectRoot = requireRelayRoot();
        const features = await listFeatures(projectRoot);

        if (features.length === 0) {
            console.error('No features found. Create one with: relay add <name>');
            process.exit(1);
        }

        // Ask for feature
        const { featureName } = await inquirer.prompt({
            type: 'input',
            name: 'featureName',
            message: 'FEATURE?',
            validate: (input: string) => features.includes(input) || `Feature '${input}' not found`
        });

        const feature = await getFeature(projectRoot, featureName);

        if (feature.tasks.length === 0) {
            console.error(`No tasks in ${featureName}. Create tasks in tasks/ folder.`);
            process.exit(1);
        }

        // Check if there's a report to review first
        const reportPath = await getLatestExchangeToRead(projectRoot, featureName, 'architect');
        if (reportPath && await fs.pathExists(reportPath)) {
            // Review mode
            console.log('\n═══════════════════════════════════════');
            console.log('            ENGINEER REPORT             ');
            console.log('═══════════════════════════════════════');
            const report = await fs.readFile(reportPath, 'utf-8');
            console.log(report);
            console.log('═══════════════════════════════════════\n');
        }

        // Ask for task
        const { taskId } = await inquirer.prompt({
            type: 'list',
            name: 'taskId',
            message: 'TASK?',
            choices: feature.tasks.map(t => ({
                name: `${t.id}: ${t.title}`,
                value: t.id
            }))
        });

        const task = feature.tasks.find(t => t.id === taskId)!;

        // Get next exchange path
        const { path: exchangePath, iteration } = await getNextExchangePath(
            projectRoot, featureName, 'architect'
        ).catch(() => {
            // First directive for this task
            return {
                path: path.join(
                    getFeatureDir(projectRoot, featureName),
                    'exchange',
                    `${task.id}-001-architect-${task.slug}.md`
                ),
                iteration: 1
            };
        });

        // Update state
        const state = await loadFeatureState(projectRoot, featureName);
        state.currentTask = task.id;
        state.currentTaskSlug = task.slug;
        if (state.lastAuthor !== 'architect' || state.currentTask !== task.id) {
            state.iteration = iteration;
        }
        state.lastAuthor = 'architect';
        state.status = 'in_progress';
        await saveFeatureState(projectRoot, featureName, state);

        // Output directive context
        console.log('\n═══════════════════════════════════════════════════════════════════════════════');
        console.log('                              ARCHITECT DIRECTIVE');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log(`\nFeature: ${featureName}`);
        console.log(`Task: ${task.id} - ${task.title}`);
        console.log(`Iteration: ${iteration}`);
        console.log(`\nPlan: ${path.join(getFeatureDir(projectRoot, featureName), 'plan.md')}`);
        console.log(`Task Spec: ${task.path}`);
        console.log(`\n───────────────────────────────────────────────────────────────────────────────`);
        console.log('                              WRITE TO:');
        console.log('───────────────────────────────────────────────────────────────────────────────');
        console.log(`\n${exchangePath}\n`);
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log('\nDraft a directive that:');
        console.log('  • References plan.md and task spec (do NOT duplicate content)');
        console.log('  • Provides specific execution instructions');
        console.log('  • Lists explicit file paths');
        console.log('  • Defines verification steps');
        console.log('\nWhen done, engineer runs: relay engineer');
        console.log('═══════════════════════════════════════════════════════════════════════════════\n');
    });

program
    .command('engineer')
    .description('Run engineer agent')
    .action(async () => {
        const projectRoot = requireRelayRoot();
        const features = await listFeatures(projectRoot);

        if (features.length === 0) {
            console.error('No features found.');
            process.exit(1);
        }

        // Ask for feature
        const { featureName } = await inquirer.prompt({
            type: 'input',
            name: 'featureName',
            message: 'FEATURE?',
            validate: (input: string) => features.includes(input) || `Feature '${input}' not found`
        });

        const feature = await getFeature(projectRoot, featureName);
        const state = feature.state;

        // Must have a directive to respond to
        const directivePath = await getLatestExchangeToRead(projectRoot, featureName, 'engineer');

        if (!directivePath || !await fs.pathExists(directivePath)) {
            console.log('\n═══════════════════════════════════════');
            console.log('         WAITING FOR DIRECTIVE          ');
            console.log('═══════════════════════════════════════');
            console.log(`\nNo directive found for ${featureName}.`);
            console.log('Architect must first run: relay architect');
            console.log('═══════════════════════════════════════\n');
            return;
        }

        // Read and display directive
        const directive = await fs.readFile(directivePath, 'utf-8');

        console.log('\n═══════════════════════════════════════════════════════════════════════════════');
        console.log('                             ARCHITECT DIRECTIVE');
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log(directive);
        console.log('═══════════════════════════════════════════════════════════════════════════════');

        // Get current task
        const task = feature.tasks.find(t => t.id === state.currentTask);
        if (!task) {
            console.error('No current task. State may be corrupted.');
            process.exit(1);
        }

        // Get report path
        const { path: reportPath, iteration } = await getNextExchangePath(
            projectRoot, featureName, 'engineer'
        );

        console.log('\n───────────────────────────────────────────────────────────────────────────────');
        console.log('                              TASK SPECIFICATION');
        console.log('───────────────────────────────────────────────────────────────────────────────');
        console.log(task.content);
        console.log('───────────────────────────────────────────────────────────────────────────────');
        console.log('                              WRITE REPORT TO:');
        console.log('───────────────────────────────────────────────────────────────────────────────');
        console.log(`\n${reportPath}\n`);
        console.log('═══════════════════════════════════════════════════════════════════════════════');
        console.log('\nExecute the directive, then report:');
        console.log('  • STATUS: COMPLETED | FAILED | BLOCKED');
        console.log('  • CHANGES: List of files modified');
        console.log('  • VERIFICATION: Results of verification steps');
        console.log('\nWhen done: relay architect');
        console.log('═══════════════════════════════════════════════════════════════════════════════\n');

        // Update state
        state.lastAuthor = 'engineer';
        state.iteration = iteration;
        await saveFeatureState(projectRoot, featureName, state);
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
