import * as fs from 'node:fs'
import * as path from 'node:path'
import { render as engineRender, Context } from './template-engine'

// Built-in pipes available to all templates (e.g. `{{ data | json }}`)
const defaultPipes = {
    json: (val: any) => JSON.stringify(val, null, 2),
    upper: (val: string) => typeof val === 'string' ? val.toUpperCase() : val,
}

export class TemplateManager {
    private userTemplateDir: string | null = null
    private defaultTemplateDir: string

    constructor() {
        this.defaultTemplateDir = path.resolve(__dirname, 'templates')
    }

    /**
     * Called once we know the target project root (e.g., in mcp.ts `initialize`).
     * Ensures the user's `.relay/templates` folder exists.
     */
    public initialize(projectRoot: string) {
        this.userTemplateDir = path.join(projectRoot, '.relay', 'templates')
        if (!fs.existsSync(this.userTemplateDir)) {
            fs.mkdirSync(this.userTemplateDir, { recursive: true })
            console.log(`[TemplateManager] Scaffolding local template directory: ${this.userTemplateDir}`)
        }
    }

    /**
     * Loads a template by filename.
     * If it doesn't exist in the user's `.relay/templates/`, copies the default there first.
     */
    private loadTemplate(filename: string): string {
        if (!this.userTemplateDir) {
            throw new Error('TemplateManager not initialized. Must call initialize(projectRoot) first.')
        }

        const userPath = path.join(this.userTemplateDir, filename)

        // Lazy Eject: if user doesn't have it, copy from our defaults
        if (!fs.existsSync(userPath)) {
            const defaultPath = path.join(this.defaultTemplateDir, filename)
            if (!fs.existsSync(defaultPath)) {
                throw new Error(`Default template not found: ${defaultPath}`)
            }
            fs.copyFileSync(defaultPath, userPath)
            console.log(`[TemplateManager] Ejected default template to local workspace: ${userPath}`)
        }

        return fs.readFileSync(userPath, 'utf8')
    }

    /**
     * Evaluates the template against the provided context.
     */
    public render(templateFilename: string, context: Context): string {
        const templateContent = this.loadTemplate(templateFilename)

        // We add a special pipe/logic here if we need to support `@include`.
        // For now, AST engine handles AST processing seamlessly.
        // If the template engine is updated to support `@include` at the AST level,
        // we would pass a resolution function. Given the MVP, we just render.

        try {
            return engineRender(templateContent, context, defaultPipes)
        } catch (e: any) {
            throw new Error(`[TemplateManager] Failed to render ${templateFilename}: ${e.message}`)
        }
    }
}

// Export a singleton for the MCP server to use
export const templateManager = new TemplateManager()
