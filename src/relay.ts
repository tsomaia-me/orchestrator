import { Command } from 'commander';
import { architectRelay, engineerRelay } from './bootstrap';
import { RelayContext } from './core/context';
import { ConsoleLogger } from './core/logger';
import { ConsoleRelayAgent } from './core/agent';
import { StateManager } from './core/state';
import { LockManager } from './core/lock';
import { AuditLogger } from './core/audit';
import path from 'path';

const program = new Command();
const workDir = process.cwd();

async function run(persona: string, args: any) {
    const logger = new ConsoleLogger();
    const lock = new LockManager(workDir);
    const state = new StateManager(workDir);
    const audit = new AuditLogger(workDir);

    try {
        await lock.acquire();

        // Handle Init
        if (args.init) {
            const memory = {
                taskStatus: 'pending',
                currentTask: {
                    id: '1',
                    description: args.init,
                    status: 'pending'
                },
                iteration: 0,
                lastUpdate: Date.now(),
                stepIndex: 0,
                hasRunSystemPrompt: false
            };
            await state.save(memory);
            console.log(`[RELAY] Initialized with goal: ${args.init}`);
            return;
        }

        const memory = await state.load();

        const ctx: RelayContext = {
            id: 'session',
            persona,
            memory,
            logger,
            agent: new ConsoleRelayAgent(logger, persona),
            args,
            paths: {
                workDir,
                reportFile: path.join(workDir, 'engineer_report.md'),
                directiveFile: path.join(workDir, 'architect_directive.md')
            }
        };

        const relay = persona === 'architect' ? architectRelay : engineerRelay;
        await relay(ctx);

        await state.save(ctx.memory);
        await audit.log(`${persona}:pulse`, { stepIndex: ctx.memory.stepIndex });

    } catch (e: any) {
        logger.error(e.message);
        process.exit(1);
    } finally {
        await lock.release();
    }
}

program.command('architect').action((opts) => run('architect', opts));
program.command('engineer').action((opts) => run('engineer', opts));

program
    .command('init')
    .argument('<goal>', 'Project goal')
    .action(async (goal) => {
        await run('system', { init: goal });
    });

program.parse(process.argv);
