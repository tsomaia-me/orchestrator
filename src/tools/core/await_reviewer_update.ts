import { AwaitUpdateSchema } from '../../schema';
import { db } from '../../db';
import { exchanges } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { buildBriefing } from '../../build-briefing';
import { eventBus } from '../../event-listener';

const WAIT_TIMEOUT_MS = 5 * 60 * 1000;

export default {
    name: 'await_reviewer_update',
    description: 'ENGINEER ONLY. Call this to wait for the Reviewer\'s updates.',
    inputSchema: AwaitUpdateSchema,
    handler: async (data: any) => {
        const checkState = async () => {
            const headArr = await db.select().from(exchanges)
                .where(eq(exchanges.taskId, data.taskId))
                .orderBy(desc(exchanges.createdAt))
                .limit(1);
            const head = headArr[0];
            if (!head) return false;
            return head.type === 'STAGE_DIRECTIVE' || head.type === 'REJECTION' || head.type === 'APPROVAL';
        };

        if (await checkState()) {
            return buildBriefing(data.taskId);
        }

        return new Promise((resolve) => {
            let timeoutId: NodeJS.Timeout;

            const listener = async () => {
                if (await checkState()) {
                    clearTimeout(timeoutId);
                    eventBus.off(`${data.taskId}.post_rejection`, listener);
                    eventBus.off(`${data.taskId}.post_approval`, listener);
                    resolve(buildBriefing(data.taskId));
                }
            };

            eventBus.on(`${data.taskId}.post_rejection`, listener);
            eventBus.on(`${data.taskId}.post_approval`, listener);

            timeoutId = setTimeout(() => {
                eventBus.off(`${data.taskId}.post_rejection`, listener);
                eventBus.off(`${data.taskId}.post_approval`, listener);
                resolve({ content: [{ type: 'text', text: 'Wait timed out after 5 minutes. The Reviewer might be still working or stuck. You can re-call this tool to keep waiting, or take other appropriate actions.' }] });
            }, WAIT_TIMEOUT_MS);
        });
    }
};
