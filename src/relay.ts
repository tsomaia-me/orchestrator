import { Command } from 'commander';
import path from 'path';
import { bootstrap } from './bootstrap';
import { RelayContext } from './core/context';
import { ConsoleLogger } from './core/logger';
import { ConsoleRelayAgent } from './core/agent';
import { StateManager } from './core/state';
import { LockManager } from './core/lock';
import { registry } from './core/transition';
import { AuditLogger } from './core/audit';

const program = new Command();

program
    .name('relay')
    .description('AI Agent Relay Protocol')
    .version('1.0.0');

// Persona Commands
program
    .command('achitect')
    .alias('architect') // Fix typo/alias
    .description('Run as Architect')
    .option('--approve', 'Approve the current work')
    .option('--reject', 'Reject the current work')
    .action(async (options) => {
        await runRelay('architect', options);
    });

program
    .command('engineer')
    .description('Run as Engineer')
    .option('--submit', 'Submit the completed work')
    .action(async (options) => {
        await runRelay('engineer', options);
    });

// Init Command
program
    .option('--init <goal>', 'Initialize Relay with a goal')
    .action(async (options) => {
        if (options.init) {
            await runRelay('system', { ...options, action: 'init', goal: options.init });
        }
    });

async function runRelay(persona: string, options: any) {
    const workDir = process.cwd();
    bootstrap(); // Register flows

    const logger = new ConsoleLogger();
    const lock = new LockManager(workDir);
    const stateManager = new StateManager(workDir);
    const audit = new AuditLogger(workDir);

    try {
        await lock.acquire();

        // Load State
        const state = await stateManager.load();

        // Determine Action
        let action = 'check'; // Default pulse action
        if (options.approve) action = 'approve';
        if (options.reject) action = 'reject';
        if (options.submit) action = 'submit';
        if (options.action) action = options.action; // Override for system commands

        const handler = registry.get(persona, action);
        if (!handler) {
            throw new Error(`No handler found for [${persona}]:${action}`);
        }

        // Build Context
        const ctx: RelayContext = {
            id: 'session',
            persona,
            memory: state,
            logger,
            agent: new ConsoleRelayAgent(logger, persona),
            args: options,
            paths: {
                workDir,
                reportFile: path.join(workDir, 'engineer_report.md'),
                directiveFile: path.join(workDir, 'architect_directive.md')
            }
        };

        // Execute Transition
        logger.info(`[RELAY] ${persona.toUpperCase()} -> ${action.toUpperCase()}`);
        await handler(ctx);

        // Persist State & Audit
        await stateManager.save(ctx.memory);
        await audit.log(`${persona}:${action}`, {
            args: options,
            memorySnapshot: ctx.memory
        });

    } catch (error: any) {
        logger.error(`FATAL: ${error.message}`);
        process.exit(1);
    } finally {
        await lock.release();
    }
}

program.parse(process.argv);

// If no args, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
