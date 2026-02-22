import { z } from 'zod';
import { db } from '../../db';
import { projects } from '../../db/schema';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

const CreateProjectSchema = z.object({
    rootPath: z.string().describe('The absolute path to the project root.'),
    name: z.string().describe('A human-readable name for the project.'),
    purpose: z.string().describe('Detailed description of the project purpose.'),
    businessGoals: z.array(z.string()).describe('List of overarching business goals for the project.')
});

export default {
    name: 'create_project',
    description: 'Registers a new project repository in the orchestrator database.',
    inputSchema: CreateProjectSchema,
    handler: async (data: z.infer<typeof CreateProjectSchema>) => {
        const id = 'proj_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);

        // Check if project exists by rootPath first
        const existing = await db.query.projects.findFirst({
            where: (projects, { eq }) => eq(projects.rootPath, data.rootPath)
        });

        if (existing) {
            await db.update(projects).set({
                name: data.name,
                purpose: data.purpose,
                businessGoals: data.businessGoals
            }).where(eq(projects.rootPath, data.rootPath));
            return { content: [{ type: 'text', text: `Project updated. ID: ${existing.id}` }] };
        }

        await db.insert(projects).values({
            id,
            name: data.name,
            rootPath: data.rootPath,
            purpose: data.purpose,
            businessGoals: data.businessGoals,
            createdAt: new Date()
        });

        return { content: [{ type: 'text', text: `Project created with ID: ${id}` }] };
    }
};
