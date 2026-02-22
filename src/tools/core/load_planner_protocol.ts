import { z } from 'zod';
import { LoadProtocolSchema } from '../../schema';
import { templateManager } from '../../template-manager';
import { initialize } from '../../helpers';

export default {
    name: 'load_planner_protocol',
    description: 'Initializes the relay and returns the Planner protocol. Call this FIRST in the planner agent chat to set up the project. After loading, use `create_project`, `propose_feature`, and `create_task` to design the system before starting engineering work.',
    inputSchema: LoadProtocolSchema,
    handler: async (data: z.infer<typeof LoadProtocolSchema>) => {
        initialize(data.projectRoot);
        templateManager.initialize(data.projectRoot);
        const text = templateManager.render('planner_protocol.mx', {});
        return { content: [{ type: 'text', text }] };
    }
};
