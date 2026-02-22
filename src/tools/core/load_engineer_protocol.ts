import { z } from 'zod';
import { LoadProtocolSchema } from '../../schema';
import { templateManager } from '../../template-manager';
import { initialize } from '../../helpers';

export default {
    name: 'load_engineer_protocol',
    description: 'Initializes the relay and returns the Engineer protocol. Call this FIRST in the engineer agent chat. After loading, call `await_reviewer_update` to receive your first task spec.',
    inputSchema: LoadProtocolSchema,
    handler: async (data: z.infer<typeof LoadProtocolSchema>) => {
        initialize(data.projectRoot);
        templateManager.initialize(data.projectRoot);
        const text = templateManager.render('engineer_protocol.mx', {});
        return { content: [{ type: 'text', text }] };
    }
};
