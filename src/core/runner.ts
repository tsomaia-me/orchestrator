import { RelayContext } from './context';
import { RelayStep } from './step';
import { RelayLogger, ConsoleLogger } from './logger';
import { v4 as uuidv4 } from 'uuid'; // We might need to install uuid or use crypto

// Simple uuid fallback if not installed
const generateId = () => Math.random().toString(36).substring(2, 15);

export interface RelayConfig {
    name: string;
    steps: RelayStep[];
}

export const createRelay = (config: RelayConfig) => {
    return async (args: Record<string, any>) => {
        const logger = new ConsoleLogger();
        logger.info(`Starting Relay: ${config.name}`);

        // Initialize Context
        const ctx: RelayContext = {
            id: generateId(),
            persona: config.name,
            memory: new Map(),
            logger,
            args,
            shouldExit: false,
            paths: {
                workDir: process.cwd(),
            }
        };

        try {
            // Execute Pipeline
            for (const step of config.steps) {
                if (ctx.shouldExit) break;
                await step(ctx);
            }
            logger.success('Relay finished.');
        } catch (error) {
            logger.error('Relay crashed:', error);
            process.exit(1);
        }
    };
};

/**
 * Creates a step that loops over a list of sub-steps indefinitely
 * until ctx.shouldExit is set or a BreakLoop error is thrown.
 */
export const loop = (steps: RelayStep[]): RelayStep => {
    return async (ctx: RelayContext) => {
        while (!ctx.shouldExit) {
            for (const step of steps) {
                if (ctx.shouldExit) break;
                await step(ctx);
            }
            // Small tick to prevent tight CPU loop in case of sync steps
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };
};
