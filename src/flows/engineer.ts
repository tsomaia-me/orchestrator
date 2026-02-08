import { RelayContext } from '../core/context';
import { registry } from '../core/transition';
import { Validator } from '../core/validator';
import fs from 'fs-extra';

/*
 * Engineer Flow
 * State 0: Init (Waiting for directive) -> Transition to Execute
 * State 1: Executing -> Transitions to Submit
 */

const validator = new Validator();

export const registerEngineerFlows = () => {

    // Default Action (Pulse Check)
    registry.register('engineer', 'check', async (ctx: RelayContext) => {
        // Check Status
        if (ctx.memory.taskStatus === 'approved') {
            ctx.agent.tell('WAIT: Task approved. Waiting for Next Directive from Architect.');
            return;
        }

        if (ctx.memory.taskStatus === 'rejected') {
            ctx.agent.tell(`TASK REJECTED. \nFEEDBACK: ${ctx.memory.feedback} \nACTION: Fix the code. Submit again.`);
            return;
        }

        // Normal Task
        if (ctx.memory.currentTask) {
            ctx.agent.tell(`TASK PENDING: ${ctx.memory.currentTask.description} \nACTION: Execute. Then run ./relay.sh engineer --submit`);
        } else {
            ctx.agent.tell('WAIT: No active task. Sleep and retry.');
        }
    });


    // Submit Action
    registry.register('engineer', 'submit', async (ctx: RelayContext) => {
        // Validate adherence to protocol
        await validator.validateEngineerReport(ctx.paths.reportFile);

        ctx.memory.taskStatus = 'review_pending';

        ctx.agent.tell('REPORT SUBMITTED. Architect will review.');
    });
};
