/**
 * SHELL: Tool Definitions
 * Zod schemas for MCP tools.
 */

import { z } from 'zod';

export const TOOLS = {
    plan_task: {
        name: 'plan_task',
        description: 'Start a new task (Architect only).',
        schema: z.object({
            title: z.string().describe('Short title of the task'),
            description: z.string().describe('Detailed description of the task'),
        }),
    },
    submit_directive: {
        name: 'submit_directive',
        description: 'Submit instructions for the Engineer (Architect only).',
        schema: z.object({
            taskId: z.string().describe('ID of the task being directed'),
            content: z.string().describe('Markdown content of the directive (must include ## EXECUTE)'),
            decision: z.enum(['APPROVE', 'REJECT']).describe('Verdict on previous work'),
        }),
    },
    submit_report: {
        name: 'submit_report',
        description: 'Submit report of work done (Engineer only).',
        schema: z.object({
            taskId: z.string().describe('ID of the task being reported'),
            content: z.string().describe('Markdown content of the report (must include ## CHANGES)'),
            status: z.enum(['COMPLETED', 'FAILED']).describe('Outcome of the work'),
        }),
    },
};
