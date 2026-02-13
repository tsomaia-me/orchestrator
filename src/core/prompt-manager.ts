/**
 * CORE: Prompt Manager
 * Nunjucks engine wrapper with strict sandboxing.
 */

import nunjucks from 'nunjucks';
import fs from 'fs-extra';
import path from 'path';
import { PromptContext } from './types/context';

export class PromptManager {
    private env: nunjucks.Environment;
    private projectRoot: string;
    private realProjectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        try {
            this.realProjectRoot = fs.realpathSync(projectRoot);
        } catch {
            this.realProjectRoot = projectRoot;
        }

        // Loaders: Priority .relay/prompts -> core/templates/prompts
        const searchPaths = [
            path.join(projectRoot, '.relay', 'prompts'),
            path.resolve(__dirname, '../../templates/prompts') // Approx path to dist
        ];

        const loader = new nunjucks.FileSystemLoader(searchPaths, {
            noCache: process.env.NODE_ENV !== 'production'
        });

        this.env = new nunjucks.Environment(loader, {
            autoescape: false, // Markdown is text
            throwOnUndefined: false, // Resilience: Do not crash on missing variables
            trimBlocks: true,
            lstripBlocks: true
        });

        // Register Helpers
        this.registerHelpers();
    }

    private registerHelpers() {
        // Safe file reader helper for Nunjucks (Must be synchronous for simple {{ read_file() }} usage)
        this.env.addGlobal('read_file', (relativePath: string) => {
            if (!relativePath) return '';
            const safePath = path.resolve(this.projectRoot, relativePath);

            // SECURITY: Block traversal & Symlinks
            try {
                const realPath = fs.realpathSync(safePath);
                if (!realPath.startsWith(this.realProjectRoot)) {
                    throw new Error(`Security Violation: Symlink traversal detected. Real path ${realPath} is outside project root.`);
                }
            } catch (err: any) {
                if (err.code === 'ENOENT') return `[File not found: ${relativePath}]`;
                throw err;
            }

            if (!safePath.startsWith(this.projectRoot)) {
                throw new Error(`Security Violation: Cannot read file outside project root: ${relativePath}`);
            }
            if (!fs.existsSync(safePath)) {
                return `[File not found: ${relativePath}]`;
            }

            // SECURITY: Size Limit (DoS Prevention) & Sync Read
            try {
                const stats = fs.statSync(safePath);
                if (stats.size > 50 * 1024) {
                    const fd = fs.openSync(safePath, 'r');
                    const buffer = Buffer.alloc(50 * 1024);
                    const bytesRead = fs.readSync(fd, buffer, 0, 50 * 1024, 0);
                    fs.closeSync(fd);
                    return buffer.toString('utf-8', 0, bytesRead) + '\n...[TRUNCATED: File exceeded 50KB limit]';
                }
                return fs.readFileSync(safePath, 'utf-8');
            } catch (err) {
                return `[Error reading file: ${err}]`;
            }
        });

        this.env.addFilter('json', (obj: any) => JSON.stringify(obj, null, 2));
    }

    /**
     * Render a prompt for a specific role and context.
     * Strategy: [role].[model].njk -> [role].njk
     */
    public render(role: string, context: PromptContext): string {
        const model = context.env.model;
        let templateName = `${role}.njk`;

        // Model-specific lookup
        if (model) {
            const specificName = `${role}.${model}.njk`;
            try {
                // getTemplate is synchronous for FileSystemLoader.
                // It throws if the template is not found in strict mode (env options), 
                // or if the loader doesn't find it.
                this.env.getTemplate(specificName);
                templateName = specificName;
            } catch (ignore) {
                // Fallback to generic template
            }
        }

        try {
            return this.env.render(templateName, context);
        } catch (error: any) {
            throw new Error(`Failed to render prompt for ${role} (using template: ${templateName}): ${error.message}`);
        }
    }
}
