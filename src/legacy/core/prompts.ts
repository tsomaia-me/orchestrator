import fs from 'fs-extra';
import path from 'path';

export class PromptLoader {
    constructor(private workDir: string) { }

    private getFilePath(persona: string): string {
        return path.join(this.workDir, 'prompts', `${persona}.md`);
    }

    async load(persona: string): Promise<string> {
        const filePath = this.getFilePath(persona);
        if (!await fs.pathExists(filePath)) {
            throw new Error(`System prompt for persona '${persona}' not found at ${filePath}`);
        }
        return fs.readFile(filePath, 'utf-8');
    }

    async exists(persona: string): Promise<boolean> {
        const filePath = this.getFilePath(persona);
        return fs.pathExists(filePath);
    }
}

