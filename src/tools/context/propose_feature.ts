import { z } from 'zod';
import { db } from '../../db';
import { features } from '../../db/schema';
import crypto from 'crypto';

const ProposeFeatureSchema = z.object({
    projectId: z.string().describe('The ID of the project this feature belongs to.'),
    name: z.string().describe('The name of the feature or epic.'),
    technicalSpecs: z.string().describe('Technical specifications and architecture details for this feature.'),
    acceptanceCriteria: z.array(z.string()).describe('List of acceptance criteria.')
});

export default {
    name: 'propose_feature',
    description: 'Defines a new feature or epic within a project.',
    inputSchema: ProposeFeatureSchema,
    handler: async (data: z.infer<typeof ProposeFeatureSchema>) => {
        const id = 'feat_' + crypto.randomUUID().replace(/-/g, '').substring(0, 10);

        await db.insert(features).values({
            id,
            projectId: data.projectId,
            name: data.name,
            technicalSpecs: data.technicalSpecs,
            acceptanceCriteria: data.acceptanceCriteria,
            createdAt: new Date(),
            status: 'PLANNING'
        });

        return { content: [{ type: 'text', text: `Feature created with ID: ${id}` }] };
    }
};
