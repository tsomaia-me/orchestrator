import { z } from 'zod';
import { db } from '../../db';

const GetProjectSchema = z.object({
    projectId: z.string()
});

export default {
    name: 'get_project',
    description: 'Fetches high-level project goals and constraints to provide context.',
    inputSchema: GetProjectSchema,
    handler: async (data: z.infer<typeof GetProjectSchema>) => {
        const project = await db.query.projects.findFirst({
            where: (projects, { eq }) => eq(projects.id, data.projectId)
        });
        if (!project) return { content: [{ type: 'text', text: 'Project not found.' }] };
        return { content: [{ type: 'text', text: JSON.stringify(project, null, 2) }] };
    }
};
