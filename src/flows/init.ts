import { RelayContext } from '../core/context';
import { registry } from '../core/transition';

/**
 * Register Init Flow
 * Handles the 'init' command to seed the state.
 */
export const registerInitFlow = () => {
    registry.register('system', 'init', async (ctx: RelayContext) => {
        const goal = ctx.args.goal;
        if (!goal) {
            throw new Error('Init requires a goal. Usage: ./relay.sh --init "Project Goal"');
        }

        // Reset/Seed State
        ctx.memory = {
            taskStatus: 'pending',
            currentTask: {
                id: '1',
                description: goal,
                status: 'pending'
            },
            iteration: 0,
            lastUpdate: Date.now()
        };

        ctx.agent.tell(`RELAY INITIALIZED.\nGOAL: ${goal}\nSTATUS: Pending Architect Review.`);
    });
};
