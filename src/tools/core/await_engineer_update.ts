import { AwaitUpdateSchema } from '../../schema';

export default {
    name: 'await_engineer_update',
    description: 'REVIEWER ONLY. Call this to wait for the Engineer\'s updates.',
    inputSchema: AwaitUpdateSchema,
    handler: async (data: any) => {
        // Waiting logic is migrated to transport-level SSE deferred RPCs.
        return { content: [{ type: 'text', text: 'Awaiting engineer...' }] };
    }
};
