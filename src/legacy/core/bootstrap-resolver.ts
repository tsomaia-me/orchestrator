import fs from 'fs-extra';
import path from 'path';
import { getRelayDir, getFeatureDir } from './resolver';

export interface BootstrapModule {
    architect: (ctx: any) => Promise<void>;
    engineer: (ctx: any) => Promise<void>;
}

/**
 * Get the package's default bootstrap
 */
async function getDefaultBootstrap(): Promise<BootstrapModule> {
    // Import the compiled default bootstrap
    // This will be at dist/bootstrap.js
    const possiblePaths = [
        path.join(__dirname, '..', 'bootstrap'),
        path.join(__dirname, '..', '..', 'dist', 'bootstrap')
    ];

    for (const p of possiblePaths) {
        try {
            // Use import() to support both CJS and ESM
            const mod = await import(p);
            return mod.default || mod;
        } catch {
            continue;
        }
    }

    throw new Error('Default bootstrap not found');
}

/**
 * Resolve bootstrap with inheritance chain:
 * 1. Feature-level: .relay/features/<feature>/bootstrap.js
 * 2. Relay-level: .relay/bootstrap.js
 * 3. Default: <package>/dist/bootstrap.js
 */
export async function resolveBootstrap(
    projectRoot: string,
    featureName?: string
): Promise<{ module: BootstrapModule; path: string; level: 'feature' | 'relay' | 'default' }> {

    // Extensions to check (mjs first for ESM priority)
    const extensions = ['.mjs', '.js', '.ts'];

    // Level 1: Feature-level
    if (featureName) {
        const featureDir = getFeatureDir(projectRoot, featureName);
        for (const ext of extensions) {
            const featurePath = path.join(featureDir, `bootstrap${ext}`);
            if (await fs.pathExists(featurePath)) {
                try {
                    // Use import() - handles ESM (.mjs) and CJS (.js)
                    const relativePath = path.isAbsolute(featurePath) ? featurePath : path.resolve(featurePath);
                    const mod = await import(relativePath);
                    const module = mod.default || mod;
                    validateBootstrap(module, 'feature');
                    return { module, path: featurePath, level: 'feature' };
                } catch (e: any) {
                    throw new Error(`Invalid feature bootstrap at ${featurePath}: ${e.message}`);
                }
            }
        }
    }

    // Level 2: Relay-level
    const relayDir = getRelayDir(projectRoot);
    for (const ext of extensions) {
        const relayPath = path.join(relayDir, `bootstrap${ext}`);
        if (await fs.pathExists(relayPath)) {
            try {
                const relativePath = path.isAbsolute(relayPath) ? relayPath : path.resolve(relayPath);
                const mod = await import(relativePath);
                const module = mod.default || mod;
                validateBootstrap(module, 'relay');
                return { module, path: relayPath, level: 'relay' };
            } catch (e: any) {
                throw new Error(`Invalid relay bootstrap at ${relayPath}: ${e.message}`);
            }
        }
    }

    // Level 3: Default
    try {
        const module = await getDefaultBootstrap();
        return { module, path: 'default', level: 'default' };
    } catch (e: any) {
        throw new Error(`Default bootstrap not found: ${e.message}`);
    }
}

/**
 * Validate bootstrap module has required exports
 */
function validateBootstrap(module: any, level: string): void {
    if (typeof module.architect !== 'function') {
        throw new Error(`${level} bootstrap missing 'architect' export`);
    }
    if (typeof module.engineer !== 'function') {
        throw new Error(`${level} bootstrap missing 'engineer' export`);
    }
}
