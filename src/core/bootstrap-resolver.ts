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
function getDefaultBootstrap(): BootstrapModule {
    // Import the compiled default bootstrap
    // This will be at dist/bootstrap.js
    const possiblePaths = [
        path.join(__dirname, '..', 'bootstrap'),
        path.join(__dirname, '..', '..', 'dist', 'bootstrap')
    ];

    for (const p of possiblePaths) {
        try {
            return require(p);
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

    // Level 1: Feature-level
    if (featureName) {
        const featurePath = path.join(getFeatureDir(projectRoot, featureName), 'bootstrap.js');
        if (await fs.pathExists(featurePath)) {
            try {
                const module = require(featurePath) as BootstrapModule;
                validateBootstrap(module, 'feature');
                return { module, path: featurePath, level: 'feature' };
            } catch (e: any) {
                throw new Error(`Invalid feature bootstrap: ${e.message}`);
            }
        }
    }

    // Level 2: Relay-level
    const relayPath = path.join(getRelayDir(projectRoot), 'bootstrap.js');
    if (await fs.pathExists(relayPath)) {
        try {
            const module = require(relayPath) as BootstrapModule;
            validateBootstrap(module, 'relay');
            return { module, path: relayPath, level: 'relay' };
        } catch (e: any) {
            throw new Error(`Invalid relay bootstrap: ${e.message}`);
        }
    }

    // Level 3: Default
    try {
        const module = getDefaultBootstrap();
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
