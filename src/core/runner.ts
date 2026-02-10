import { RelayContext } from './context';
import { RelayStep } from './step';
import { StateManager } from './state';

export interface RelayPipeline {
    name: string;
    steps: RelayStep[];
}

export const createRelay = (config: RelayPipeline) => {
    return async (ctx: RelayContext) => {
        const stateManager = new StateManager(ctx.paths.workDir);

        // Namespace state keys by pipeline name to prevent persona conflicts
        const stepIndexKey = `${config.name}_stepIndex` as keyof typeof ctx.memory;
        let currentIndex = (ctx.memory as any)[stepIndexKey] || 0;

        // If we finished the pipeline before, reset? Or stay done?
        if (currentIndex >= config.steps.length) {
            // Auto-restart pipeline if verified complete
            currentIndex = 0;
            ctx.logger.info("[INFO] Pipeline restarting...");
        }

        // Execute from current index
        for (let i = currentIndex; i < config.steps.length; i++) {
            const step = config.steps[i];
            const result = await step(ctx);

            if (result === 'WAIT') {
                (ctx.memory as any)[stepIndexKey] = i;
                await stateManager.save(ctx.memory);
                return; // Exit process (Pulse)
            }

            if (result === 'STOP') {
                (ctx.memory as any)[stepIndexKey] = i + 1;
                await stateManager.save(ctx.memory);
                return;
            }
        }

        // If we fell off the end, reset for next run
        (ctx.memory as any)[stepIndexKey] = 0;
        await stateManager.save(ctx.memory);
    };
};

/**
 * Loop Step: Executes its children until one returns WAIT or STOP.
 * If children complete, it restarts them immediately.
 * Safety limit prevents infinite loops.
 */
export const loop = (steps: RelayStep[], loopName?: string): RelayStep => {
    const stepFn = async (ctx: RelayContext) => {
        const MAX_LOOP_ITERATIONS = ctx.memory.maxLoopIterations || 100;

        // Use persona-namespaced loop index
        const loopIndexKey = `${ctx.persona}_loopIndex` as keyof typeof ctx.memory;
        const inLoopKey = `${ctx.persona}_inLoop` as keyof typeof ctx.memory;

        let loopIndex = (ctx.memory as any)[loopIndexKey] || 0;
        let totalIterations = 0;

        while (totalIterations < MAX_LOOP_ITERATIONS) {
            if (loopIndex >= steps.length) {
                loopIndex = 0; // Restart loop
                totalIterations++; // Count full loop cycles
            }

            const step = steps[loopIndex];
            const result = await step(ctx);

            if (result === 'WAIT') {
                (ctx.memory as any)[loopIndexKey] = loopIndex;
                (ctx.memory as any)[inLoopKey] = true;
                return 'WAIT';
            }

            if (result === 'STOP') {
                (ctx.memory as any)[loopIndexKey] = 0;
                (ctx.memory as any)[inLoopKey] = false;
                return 'STOP';
            }

            // Continue to next step
            loopIndex++;
        }

        // Safety limit reached
        ctx.logger.warn(`Loop safety limit reached (${MAX_LOOP_ITERATIONS} iterations). Stopping.`);
        (ctx.memory as any)[loopIndexKey] = 0;
        (ctx.memory as any)[inLoopKey] = false;
        return 'STOP';
    };

    // Set function name for debugging
    Object.defineProperty(stepFn, 'name', { value: loopName || 'loop' });
    return stepFn;
};
