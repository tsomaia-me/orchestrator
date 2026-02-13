/**
 * CORE: Safe I/O
 * Security primitives for file access.
 */

import fs from 'fs-extra';
import path from 'path';

const MAX_FILE_SIZE_BYTES = 50 * 1024; // 50KB

/**
 * Read a file safely with path validation and size limits.
 * @param rootDir Project root directory to sandbox within
 * @param relativePath Relative path to the file
 * @returns Content string (truncated if necessary) or null if invalid/missing
 * @throws Error if path traversal detected
 */
export async function readSafeFile(rootDir: string, relativePath: string): Promise<string | null> {
    if (!relativePath) return null;

    const safePath = path.resolve(rootDir, relativePath);

    // SECURITY: Block traversal
    if (!safePath.startsWith(rootDir)) {
        throw new Error(`Security Violation: Cannot read file outside project root: ${relativePath}`);
    }

    if (!(await fs.pathExists(safePath))) {
        return null; // Don't throw, just return null for optional files
    }

    // SECURITY: Size Limit (DoS Prevention)
    try {
        const stats = await fs.stat(safePath);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
            // Read only the first N bytes
            const fd = await fs.open(safePath, 'r');
            const buffer = Buffer.alloc(MAX_FILE_SIZE_BYTES);
            const { bytesRead } = await fs.read(fd, buffer, 0, MAX_FILE_SIZE_BYTES, 0);
            await fs.close(fd);
            return buffer.toString('utf-8', 0, bytesRead) + '\n...[TRUNCATED: File exceeded 50KB limit]';
        } else {
            return await fs.readFile(safePath, 'utf-8');
        }
    } catch (err) {
        console.warn(`Safe read failed for ${relativePath}:`, err);
        return null;
    }
}
