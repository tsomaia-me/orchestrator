import { AwaitUpdateSchema } from '../../schema';

export default {
    name: 'await_reviewer_update',
    description: 'ENGINEER ONLY. Call this to wait for the Reviewer\'s updates.',
    inputSchema: AwaitUpdateSchema,
    handler: async (data: any) => {
        // Waiting logic is migrated to transport-level SSE deferred RPCs.
        return { content: [{ type: 'text', text: 'Awaiting reviewer...' }] };
    }
};
