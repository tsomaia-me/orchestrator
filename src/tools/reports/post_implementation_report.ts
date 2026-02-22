import { z } from 'zod';
import { db } from '../../db';
import { exchanges } from '../../db/schema';
import { EngineerReportSchema } from '../../schema';
import crypto from 'crypto';
import { templateManager } from '../../template-manager';
import { getProjectRoot } from '../../helpers';

export default {
    name: 'post_implementation_report',
    description: 'ENGINEER ONLY. Submit your implementation report. Callable when phase is AWAITING_IMPLEMENTATION_REPORT.',
    inputSchema: z.object({
        taskId: z.string(),
        report: EngineerReportSchema
    }),
    handler: async (data: any) => {
        const head = await db.query.exchanges.findFirst({
            where: (exchanges, { eq }) => eq(exchanges.taskId, data.taskId),
            orderBy: (exchanges, { desc }) => [desc(exchanges.createdAt)]
        });

        if (!head || (head.type !== 'STAGE_DIRECTIVE' && head.type !== 'REJECTION')) {
            return { content: [{ type: 'text', text: 'Error: Cannot submit report. Task is not awaiting engineer implementation.' }] };
        }

        const payload = data.report;
        const hashData = JSON.stringify(payload) + head.hash;
        const hash = crypto.createHash('sha256').update(hashData).digest('hex');
        const id = 'exc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);

        try {
            await db.insert(exchanges).values({
                id,
                taskId: data.taskId,
                type: 'IMPLEMENTATION_REPORT',
                author: 'engineer',
                parentHash: head.hash,
                hash,
                payload,
                createdAt: new Date()
            });
        } catch (err: any) {
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
                templateManager.initialize(getProjectRoot());
                const newHead = await db.query.exchanges.findFirst({
                    where: (exchanges, { eq }) => eq(exchanges.taskId, data.taskId),
                    orderBy: (exchanges, { desc }) => [desc(exchanges.createdAt)]
                });
                const text = templateManager.render('STATE_CHANGED_WHILE_AWAITING_LOCK.mx', { newHead });
                return { content: [{ type: 'text', text }] };
            }
            throw err;
        }

        // Notify the Event Bus about the new exchange
        const { eventBus } = await import('../../event-listener');
        eventBus.trigger(`${data.taskId}.post_implementation_report`, payload);

        return { content: [{ type: 'text', text: 'Report submitted successfully. Proceed to await reviewer update.' }] };
    }
};
