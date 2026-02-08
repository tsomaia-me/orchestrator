import { RelayContext } from '../core/context';
import { registry } from '../core/transition';
import { Validator } from '../core/validator';
import fs from 'fs-extra';
/*
 * Architect Flow
 * State 0: Init (Waiting for report) -> Transition to Review
 * State 1: Reviewing (Reads report) -> Transitions to Feedback
 */

const validator = new Validator();

export const registerArchitectFlows = () => {

    // Default Action (Pulse Check)
    registry.register('architect', 'check', async (ctx: RelayContext) => {
        // Check if there is a pending report from Engineer
        if (await fs.pathExists(ctx.paths.reportFile)) {
            ctx.agent.tell(`ENGINEER REPORT FOUND at ${ctx.paths.reportFile}. \nACTION: Read it. Evaluate the code. Then run ./relay.sh architect --approve or --reject.`);
        } else {
            ctx.agent.tell('WAIT: No report from Engineer yet. Sleep and retry.');
        }
    });

    // Approval Action
    registry.register('architect', 'approve', async (ctx: RelayContext) => {
        const feedback = await validator.validateArchitectDirective(ctx.paths.directiveFile);

        // Move state forward
        ctx.memory.taskStatus = 'approved';
        ctx.memory.feedback = feedback;

        // Archive the report to clear the signal for Engineer
        await fs.move(ctx.paths.reportFile, `${ctx.paths.reportFile}.archived.${Date.now()}`);

        ctx.agent.tell('APPROVAL SUBMITTED. Engineer will be notified.');
    });

    // Rejection Action
    registry.register('architect', 'reject', async (ctx: RelayContext) => {
        const feedback = await validator.validateArchitectDirective(ctx.paths.directiveFile);

        // Move state backward
        ctx.memory.taskStatus = 'rejected';
        ctx.memory.feedback = feedback;

        // Archive the report
        await fs.move(ctx.paths.reportFile, `${ctx.paths.reportFile}.archived.${Date.now()}`);

        ctx.agent.tell('REJECTION SUBMITTED. Engineer will be notified.');
    });
};
