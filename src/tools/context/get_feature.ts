import { z } from 'zod';
import { db } from '../../db';

const GetFeatureSchema = z.object({
    featureId: z.string()
});

export default {
    name: 'get_feature',
    description: 'Fetches technical specs and acceptance criteria for a feature.',
    inputSchema: GetFeatureSchema,
    handler: async (data: z.infer<typeof GetFeatureSchema>) => {
        const feature = await db.query.features.findFirst({
            where: (features, { eq }) => eq(features.id, data.featureId)
        });
        if (!feature) return { content: [{ type: 'text', text: 'Feature not found.' }] };
        return { content: [{ type: 'text', text: JSON.stringify(feature, null, 2) }] };
    }
};
