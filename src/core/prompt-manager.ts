/**
 * CORE: Prompt Manager
 * Nunjucks engine wrapper with strict sandboxing.
 */

import nunjucks from 'nunjucks';
import fs from 'fs-extra';
import path from 'path';
import { PromptContext } from './types/context';
import { readSafeFileSync } from './io';

export class PromptManager {
    private env: nunjucks.Environment;
    private projectRoot: string;


    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;


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
            // Use centralized safe sync reader
            // Round 2: Returns <<ERROR: FILE_TOO_LARGE>> if > 50KB
            const content = readSafeFileSync(this.projectRoot, relativePath);
            if (content === null) return `[File not found: ${relativePath}]`;
            return content;
        });

        this.env.addFilter('json', (obj: any) => JSON.stringify(obj, null, 2));
    }

    /**
     * Render a prompt for a specific role and context.
     * Strategy: [role].[model].njk -> [role].njk
     */
    public async render(role: string, context: PromptContext): Promise<string> {
        const model = context.env.model;
        let templateName = `${role}.njk`;

        // Model-specific lookup
        if (model) {
            // Round 2: Strict Model Validation
            if (!/^[a-zA-Z0-9.-]+$/.test(model)) {
                console.warn(`Invalid model name rejected: ${model}`);
                // Fallback to generic, do not attempt to load unsafe path
            } else {
                const specificName = `${role}.${model}.njk`;
                try {
                    // getTemplate is synchronous for FileSystemLoader.
                    this.env.getTemplate(specificName);
                    templateName = specificName;
                } catch (ignore) {
                    // Fallback to generic template
                }
            }
        }

        return new Promise((resolve, reject) => {
            this.env.render(templateName, context, (error, rendered) => {
                if (error) {
                    reject(new Error(`Failed to render prompt for ${role} (using template: ${templateName}): ${error.message}`));
                    return;
                }
                resolve(rendered || '');
            });
        });
    }
}
