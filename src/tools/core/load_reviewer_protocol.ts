import { z } from 'zod';
import { LoadProtocolSchema } from '../../schema';
import { templateManager } from '../../template-manager';
import { initialize } from '../../helpers';

export default {
    name: 'load_reviewer_protocol',
    description: 'Initializes the relay and returns the Reviewer protocol. Call this FIRST in the reviewer agent chat. After loading, call `await_engineer_update` to receive your first task.',
    inputSchema: LoadProtocolSchema,
    handler: async (data: z.infer<typeof LoadProtocolSchema>) => {
        initialize(data.projectRoot);
        templateManager.initialize(data.projectRoot);
        const text = templateManager.render('reviewer_protocol.mx', {});
        return { content: [{ type: 'text', text }] };
    }
};
