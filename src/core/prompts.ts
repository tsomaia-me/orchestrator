import fs from 'fs-extra';
import path from 'path';

export class PromptLoader {
    constructor(private promptDir: string) { }

    async load(persona: string): Promise<string> {
        const filePath = path.join(this.promptDir, `${persona}.md`);
        if (!await fs.pathExists(filePath)) {
            throw new Error(`System prompt for persona '${persona}' not found at ${filePath}`);
        }
        return fs.readFile(filePath, 'utf-8');
    }
}
