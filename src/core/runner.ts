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
        let currentIndex = ctx.memory.stepIndex || 0;

        // If we finished the pipeline before, reset? Or stay done?
        if (currentIndex >= config.steps.length) {
            // For now, reset to 0 if we looped or finished?
            // Actually, let's assume if it finished, it finished.
            // But if it's a loop, it should never finish.
            if (config.steps.length > 0 && config.steps[0].name === 'loop') {
                currentIndex = 0;
            } else {
                ctx.agent.tell("Pipeline completed.");
                return;
            }
        }

        // Execute from current index
        for (let i = currentIndex; i < config.steps.length; i++) {
            const step = config.steps[i];

            // Execute Step
            // ctx.logger.info(`[STEP] ${step.name}`);
            const result = await step(ctx);

            if (result === 'WAIT') {
                // Save state at current index (to retry next time)
                ctx.memory.stepIndex = i;
                await stateManager.save(ctx.memory);
                return; // Exit process (Pulse)
            }

            if (result === 'STOP') {
                ctx.memory.stepIndex = i + 1; // Mark as done
                await stateManager.save(ctx.memory);
                return;
            }

            // CONTINUE: Move to next step
        }

        // Checks if we fell off the end of the list
        ctx.memory.stepIndex = 0; // Reset for next run? Or keep at end? State machine logic.
        // If we are here, we finished the list.
        await stateManager.save(ctx.memory);
    };
};

/**
 * Loop Step: Executes its children until one returns WAIT or STOP.
 * If children complete, it restarts them immediately.
 */
export const loop = (steps: RelayStep[]): RelayStep => {
    return async (ctx: RelayContext) => {
        // Loop Internal State
        // We need to track where we are INSIDE the loop.
        // This is tricky with flat state.
        // Simplified: The loop is just a list of steps. 
        // We rely on the Runner to handle index? 
        // Actually, 'loop' as a step in a list means the runner enters it.

        // Revised Strategy: Flatten the loop? 
        // Or specific 'loop' logic in runner?

        // Let's keep it simple: The `createRelay` steps are the main loop.
        // We don't need a recursive `loop` step if the main runner just resets index to 0.

        // BUT user asked for `loop([...])`.
        // So `loop` executes the sub-steps.

        let loopIndex = ctx.memory.loopIndex || 0;

        while (true) {
            if (loopIndex >= steps.length) {
                loopIndex = 0; // Restart loop
            }

            const step = steps[loopIndex];
            const result = await step(ctx);

            if (result === 'WAIT') {
                ctx.memory.loopIndex = loopIndex;
                ctx.memory.inLoop = true;
                return 'WAIT';
            }

            if (result === 'STOP') {
                return 'STOP';
            }

            // Continue
            loopIndex++;
        }
    };
};
