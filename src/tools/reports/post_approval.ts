import { z } from 'zod';
import { db } from '../../db';
import { exchanges } from '../../db/schema';
import { ApprovalSchema } from '../../schema';
import crypto from 'crypto';
import { templateManager } from '../../template-manager';
import { getProjectRootForTask } from '../../helpers';

export default {
    name: 'post_approval',
    description: 'REVIEWER ONLY. Approve the Engineer\'s work.',
    inputSchema: z.object({
        taskId: z.string(),
        approval: ApprovalSchema
    }),
    handler: async (data: any) => {
        const head = await db.query.exchanges.findFirst({
            where: (exchanges, { eq }) => eq(exchanges.taskId, data.taskId),
            orderBy: (exchanges, { desc }) => [desc(exchanges.createdAt)]
        });

        if (!head || (head.type !== 'IMPLEMENTATION_REPORT' && head.type !== 'COMMENTS_RESOLUTION')) {
            return { content: [{ type: 'text', text: 'Error: Cannot approve. Task is not awaiting review.' }] };
        }

        const payload = data.approval;
        const hashData = JSON.stringify(payload) + head.hash;
        const hash = crypto.createHash('sha256').update(hashData).digest('hex');
        const id = 'exc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);

        try {
            await db.insert(exchanges).values({
                id,
                taskId: data.taskId,
                type: 'APPROVAL',
                author: 'reviewer',
                parentHash: head.hash,
                hash,
                payload,
                createdAt: new Date()
            });
        } catch (err: any) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                templateManager.initialize(await getProjectRootForTask(data.taskId));
                const newHead = await db.query.exchanges.findFirst({
                    where: (exchanges, { eq }) => eq(exchanges.taskId, data.taskId),
                    orderBy: (exchanges, { desc }) => [desc(exchanges.createdAt)]
                });
                const text = templateManager.render('STATE_CHANGED_WHILE_AWAITING_LOCK.mx', { newHead });
                return { content: [{ type: 'text', text }] };
            }
            throw err;
        }

        const { eventBus } = await import('../../event-listener');
        eventBus.trigger(`${data.taskId}.post_approval`, payload);

        return { content: [{ type: 'text', text: 'Approval submitted successfully.' }] };
    }
};
