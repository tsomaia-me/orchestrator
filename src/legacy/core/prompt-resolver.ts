import fs from 'fs-extra';
import path from 'path';
import { getRelayDir, getFeatureDir } from './resolver';

/**
 * Get the package's default prompts directory
 */
function getDefaultPromptsDir(): string {
    // In production, prompts are at package root
    // During dev, they're relative to compiled output
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'prompts'),      // From dist/core/
        path.join(__dirname, '..', '..', '..', 'prompts'), // Alternative
        path.join(process.cwd(), 'prompts')               // Fallback to cwd
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    return possiblePaths[0]; // Return first as fallback
}

/**
 * Resolve prompt file with inheritance chain:
 * 1. Feature-level: .relay/features/<feature>/prompts/<persona>.md
 * 2. Relay-level: .relay/prompts/<persona>.md
 * 3. Default: <package>/prompts/<persona>.md
 * 
 * Returns the resolved path and content
 */
export async function resolvePrompt(
    projectRoot: string,
    persona: 'architect' | 'engineer',
    featureName?: string
): Promise<{ path: string; content: string; level: 'feature' | 'relay' | 'default' }> {
    const filename = `${persona}.md`;

    // Level 1: Feature-level
    if (featureName) {
        const featurePath = path.join(getFeatureDir(projectRoot, featureName), 'prompts', filename);
        if (await fs.pathExists(featurePath)) {
            return {
                path: featurePath,
                content: await fs.readFile(featurePath, 'utf-8'),
                level: 'feature'
            };
        }
    }

    // Level 2: Relay-level
    const relayPath = path.join(getRelayDir(projectRoot), 'prompts', filename);
    if (await fs.pathExists(relayPath)) {
        return {
            path: relayPath,
            content: await fs.readFile(relayPath, 'utf-8'),
            level: 'relay'
        };
    }

    // Level 3: Default (package)
    const defaultPath = path.join(getDefaultPromptsDir(), filename);
    if (await fs.pathExists(defaultPath)) {
        return {
            path: defaultPath,
            content: await fs.readFile(defaultPath, 'utf-8'),
            level: 'default'
        };
    }

    throw new Error(`Prompt not found for ${persona}. Checked: feature, .relay, default`);
}

/**
 * Get all resolved prompts for a feature
 */
export async function resolveAllPrompts(
    projectRoot: string,
    featureName?: string
): Promise<{
    architect: { path: string; content: string; level: string };
    engineer: { path: string; content: string; level: string };
}> {
    return {
        architect: await resolvePrompt(projectRoot, 'architect', featureName),
        engineer: await resolvePrompt(projectRoot, 'engineer', featureName)
    };
}
