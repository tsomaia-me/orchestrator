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

        const existing = await db.query.tasks.findFirst({
            where: (t, { eq }) => eq(t.id, data.taskId),
        });
        if (existing) {
            return {
                content: [{
                    type: 'text',
                    text: `Task "${data.taskId}" already exists in feature "${data.featureId}". Use a different taskId or skip this task. Each taskId must be unique within the project.`
                }]
            };
        }

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
        try {
            await db.transaction(async (tx) => {
                await tx.insert(tasks).values(taskPayload);
                await tx.insert(exchanges).values(exchangePayload);
            });
        } catch (err: any) {
            if (err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || (err?.message?.includes('UNIQUE constraint failed') && err?.message?.includes('tasks'))) {
                return {
                    content: [{
                        type: 'text',
                        text: `Task "${data.taskId}" already exists. Another agent may have created it. Use a different taskId or proceed with the existing task.`
                    }]
                };
            }
            throw err;
        }

        return { content: [{ type: 'text', text: `Task ${taskId} created and Genesis Exchange dispatched.` }] };
    }
};
