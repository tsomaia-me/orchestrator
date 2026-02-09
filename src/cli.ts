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
// INIT COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

program
    .command('init [feature]')
    .description('Initialize .relay folder or create a new feature')
    .action(async (featureName?: string) => {
        if (featureName) {
            // Create feature in existing .relay
            const projectRoot = requireRelayRoot();

            try {
                await createFeature(projectRoot, featureName);
                console.log(`✓ Created feature: ${featureName}`);
                console.log(`  → ${getFeatureDir(projectRoot, featureName)}`);
                console.log(`\nNext steps:`);
                console.log(`  1. Edit plan.md with your architectural plan`);
                console.log(`  2. Create tasks in tasks/ folder (001-xxx.md)`);
                console.log(`  3. Run: relay architect`);
            } catch (e: any) {
                console.error(`Error: ${e.message}`);
                process.exit(1);
            }
        } else {
            // Create .relay folder
            const root = findRelayRoot();
            if (root) {
                console.log(`Already initialized: ${getRelayDir(root)}`);
                return;
            }

            const relayDir = getRelayDir(process.cwd());
            await fs.ensureDir(path.join(relayDir, 'features'));
            await fs.ensureDir(path.join(relayDir, 'archive'));
            await fs.ensureDir(path.join(relayDir, 'prompts'));

            console.log(`✓ Initialized: ${relayDir}`);
            console.log(`\nNext steps:`);
            console.log(`  relay init <feature>  - Create a feature`);
        }
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
            console.log('Create one with: relay init <feature>');
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
            console.error('No features found. Create one with: relay init <feature>');
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

        // Load prompt
        const prompt = await resolvePrompt(projectRoot, 'architect', featureName);

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

        // Load prompt
        const prompt = await resolvePrompt(projectRoot, 'engineer', featureName);

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
