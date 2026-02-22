import { z } from 'zod';
import { db } from '../../db';
import { tasks, exchanges } from '../../db/schema';
import { CreateTaskSchema } from '../../schema';
import crypto from 'crypto';

export default {
    name: 'create_task',
    description: 'Creates a new task within a feature and dispatches the Genesis Directive to the Engineer.',
    inputSchema: CreateTaskSchema,
    handler: async (data: z.infer<typeof CreateTaskSchema>) => {
        const taskId = data.taskId;

        const taskPayload = {
            id: taskId,
            featureId: data.featureId,
            objective: data.spec.objective,
            requirements: data.spec.requirements,
            constraints: data.spec.constraints,
            createdAt: new Date()
        };

        const genesisExchangeId = 'exc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);
        const genesisPayload = {
            directive: 'Genesis Directive: Begin implementation.',
            spec: data.spec
        };

        const genesisHash = crypto.createHash('sha256').update(JSON.stringify(genesisPayload)).digest('hex');

        const exchangePayload = {
            id: genesisExchangeId,
            taskId: taskId,
            type: 'STAGE_DIRECTIVE',
            author: 'planner',
            parentHash: null,
            hash: genesisHash,
            payload: genesisPayload,
            createdAt: new Date()
        };

        // Drizzle transaction for atomic insert of Task + Genesis Exchange
        await db.transaction(async (tx) => {
            await tx.insert(tasks).values(taskPayload);
            await tx.insert(exchanges).values(exchangePayload);
        });

        return { content: [{ type: 'text', text: `Task ${taskId} created and Genesis Exchange dispatched.` }] };
    }
};
