import { AwaitUpdateSchema } from '../../schema';
import { AWAIT_TIMEOUT_MS } from '../../config';
import { db } from '../../db';
import { exchanges } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { buildBriefing } from '../../build-briefing';
import { eventBus } from '../../event-listener';

const timeoutSeconds = Math.round(AWAIT_TIMEOUT_MS / 1000);

export default {
    name: 'await_engineer_update',
    description: 'REVIEWER ONLY. Call this to wait for the Engineer\'s updates.',
    inputSchema: AwaitUpdateSchema,
    handler: async (data: any) => {
        const checkState = async () => {
            const headArr = await db.select().from(exchanges)
                .where(eq(exchanges.taskId, data.taskId))
                .orderBy(desc(exchanges.createdAt))
                .limit(1);
            const head = headArr[0];
            if (!head) return false;
            return head.type === 'IMPLEMENTATION_REPORT' || head.type === 'COMMENTS_RESOLUTION' || head.type === 'APPROVAL';
        };

        if (await checkState()) {
            return buildBriefing(data.taskId);
        }

        return new Promise((resolve) => {
            let timeoutId: NodeJS.Timeout;

            const listener = async () => {
                if (await checkState()) {
                    clearTimeout(timeoutId);
                    eventBus.off(`${data.taskId}.post_implementation_report`, listener);
                    eventBus.off(`${data.taskId}.post_comments_resolution`, listener);
                    resolve(buildBriefing(data.taskId));
                }
            };

            eventBus.on(`${data.taskId}.post_implementation_report`, listener);
            eventBus.on(`${data.taskId}.post_comments_resolution`, listener);

            timeoutId = setTimeout(() => {
                eventBus.off(`${data.taskId}.post_implementation_report`, listener);
                eventBus.off(`${data.taskId}.post_comments_resolution`, listener);
                resolve({ content: [{ type: 'text', text: `Wait timed out after ${timeoutSeconds} seconds. The Engineer might be still working or stuck. You can re-call this tool to keep waiting, or take other appropriate actions.` }] });
            }, AWAIT_TIMEOUT_MS);
        });
    }
};
