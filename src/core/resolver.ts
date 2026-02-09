import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Find the .relay root directory by walking up the directory tree
 * Similar to how git finds .git
 */
export function findRelayRoot(startDir: string = process.cwd()): string | null {
    let current = path.resolve(startDir);
    const root = path.parse(current).root;
    const home = os.homedir();

    while (current !== root && current !== home) {
        const relayPath = path.join(current, '.relay');

        if (fs.existsSync(relayPath) && fs.statSync(relayPath).isDirectory()) {
            return current;
        }

        current = path.dirname(current);
    }

    // Check root and home as final options
    for (const dir of [root, home]) {
        const relayPath = path.join(dir, '.relay');
        if (fs.existsSync(relayPath) && fs.statSync(relayPath).isDirectory()) {
            return dir;
        }
    }

    return null;
}

/**
 * Get the .relay directory path
 */
export function getRelayDir(projectRoot: string): string {
    return path.join(projectRoot, '.relay');
}

/**
 * Get the features directory path
 */
export function getFeaturesDir(projectRoot: string): string {
    return path.join(projectRoot, '.relay', 'features');
}

/**
 * Get a specific feature directory path
 */
export function getFeatureDir(projectRoot: string, featureName: string): string {
    return path.join(projectRoot, '.relay', 'features', featureName);
}

/**
 * Get the archive directory path
 */
export function getArchiveDir(projectRoot: string): string {
    return path.join(projectRoot, '.relay', 'archive');
}

/**
 * Require .relay root or exit with error
 */
export function requireRelayRoot(): string {
    const root = findRelayRoot();
    if (!root) {
        console.error("Error: No .relay folder found.");
        console.error("Run 'relay init' to create one in the current directory.");
        process.exit(1);
    }
    return root;
}
