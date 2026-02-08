import { RelayStep, step } from '../core/step';
import { PromptLoader } from '../core/prompts';
import { Validator } from '../core/validator';
import fs from 'fs-extra';
import path from 'path';

// System Steps
export const systemPrompt = (persona: string) => step('systemPrompt', async (ctx) => {
    // Only run once?
    if (ctx.memory.hasRunSystemPrompt) return 'CONTINUE';

    // Load Prompt
    const loader = new PromptLoader(path.join(ctx.paths.workDir, 'src/prompts')); // Assuming prompts are source or dist? 
    // Actually prompts are in root 'prompts/' based on previous tasks
    // Fixing path:
    const promptPath = path.join(ctx.paths.workDir, 'prompts', `${persona}.md`);

    if (await fs.pathExists(promptPath)) {
        const content = await fs.readFile(promptPath, 'utf-8');
        // We don't output system prompt to console every time, 
        // but maybe we should log it once?
        // ctx.agent.tell(content); // This would spam.
    }

    ctx.memory.hasRunSystemPrompt = true;
    return 'CONTINUE';
});


// Navigation Steps
export const lookupTask = () => step('lookupTask', async (ctx) => {
    if (!ctx.memory.taskStatus) {
        ctx.memory.taskStatus = 'pending';
    }
    // Logic to find task? For now just continue availability check
    return 'CONTINUE';
});


// Coordination Steps
export const awaitFile = (filePathKey: 'reportFile' | 'directiveFile') => step('awaitFile', async (ctx) => {
    const filePath = ctx.paths[filePathKey];
    if (await fs.pathExists(filePath)) {
        return 'CONTINUE';
    } else {
        ctx.agent.tell(`WAITING: File not found at ${filePath}`);
        return 'WAIT';
    }
});

export const writeDirective = () => step('writeDirective', async (ctx) => {
    // Logic to ask Architect for input? 
    // In strict cli mode, maybe we check if arguments provided directive?
    // Or we just output instructions?

    // Architect Logic:
    ctx.agent.tell(`ACTION: Write directive to ${ctx.paths.directiveFile}`);
    // We don't block here? We expect user to do it.
    // If we want to verify user did it, we should awaitFile NEXT.
    return 'CONTINUE';
});
