/**
 * CORE: Safe I/O
 * Security primitives for file access.
 */

import fs from 'fs-extra';
import path from 'path';

const MAX_FILE_SIZE_BYTES = 50 * 1024; // 50KB

/**
 * Audit b79b0667: Proper containment check. realPath.startsWith(realRootDir) is broken —
 * /home/user/relay-secrets passes when root is /home/user/relay.
 * path.relative avoids prefix trap and handles Windows case sensitivity.
 */
function isPathInsideRoot(realPath: string, realRootDir: string): boolean {
    const relative = path.relative(realRootDir, realPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Read a file safely with path validation and size limits.
 * @param rootDir Project root directory to sandbox within
 * @param relativePath Relative path to the file
 * @returns Content string (truncated if necessary) or null if invalid/missing
 * @throws Error if path traversal detected
 */
export async function readSafeFile(rootDir: string, relativePath: string): Promise<string | null> {
    if (!relativePath) return null;

    // Resolve rootDir once to handle macOS /var -> /private/var aliasing
    const realRootDir = await fs.realpath(rootDir);

    const safePath = path.resolve(rootDir, relativePath);

    // SECURITY: Block traversal & Symlinks
    // Resolve the actual physical path to ensure it's inside rootDir
    // This prevents symlinks inside rootDir pointing to files outside
    const realPath = await fs.realpath(safePath);
    if (!isPathInsideRoot(realPath, realRootDir)) {
        throw new Error(`Security Violation: Path traversal detected. Real path ${realPath} is outside project root.`);
    }

    if (!(await fs.pathExists(safePath))) {
        return null; // Don't throw, just return null for optional files
    }

    // SECURITY: Size Limit (DoS Prevention)
    try {
        const stats = await fs.stat(safePath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
            // Round 2/3: Return distinct error string instead of truncated content
            return '<<ERROR: FILE_TOO_LARGE>>';
        } else {
            return await fs.readFile(safePath, 'utf-8');
        }
    } catch (err) {
        console.warn(`Safe read failed for ${relativePath}:`, err);
        return null;
    }
}

/**
 * Synchronous version of readSafeFile for Nunjucks.
 */
export function readSafeFileSync(rootDir: string, relativePath: string): string | null {
    if (!relativePath) return null;

    // Resolve rootDir once
    let realRootDir: string;
    try {
        realRootDir = fs.realpathSync(rootDir);
    } catch {
        realRootDir = rootDir; // Fallback
    }

    const safePath = path.resolve(rootDir, relativePath);

    // SECURITY: Block traversal & Symlinks
    let realPath: string;
    try {
        realPath = fs.realpathSync(safePath);
    } catch (err: any) {
        // File doesn't exist or other error
        if (err.code === 'ENOENT') return null;
        throw err;
    }

    if (!isPathInsideRoot(realPath, realRootDir)) {
        throw new Error(`Security Violation: Path traversal detected. Real path ${realPath} is outside project root.`);
    }

    // SECURITY: Size Limit (DoS Prevention)
    try {
        const stats = fs.statSync(safePath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
            // Round 2: Return distinct error string instead of truncated content
            return '<<ERROR: FILE_TOO_LARGE>>';
        } else {
            return fs.readFileSync(safePath, 'utf-8');
        }
    } catch (err) {
        console.warn(`Safe read failed for ${relativePath}:`, err);
        return null;
    }
}
