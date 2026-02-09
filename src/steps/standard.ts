import { RelayStep, step } from '../core/step';
import { PromptLoader } from '../core/prompts';
import { Validator } from '../core/validator';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

// Helper: Hash file content for change detection
const hashFile = async (filePath: string): Promise<string> => {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('md5').update(content).digest('hex');
};

// ==================== SYSTEM STEPS ====================

/**
 * Load and display system prompt for persona (runs once per session)
 */
export const systemPrompt = (persona: string) => step('systemPrompt', async (ctx) => {
    if (ctx.memory.hasRunSystemPrompt) return 'CONTINUE';

    const loader = new PromptLoader(ctx.paths.workDir);

    try {
        if (await loader.exists(persona)) {
            const content = await loader.load(persona);
            ctx.logger.info(`\n=== ${persona.toUpperCase()} PERSONA LOADED ===\n`);
            // Don't spam the full prompt, just confirm it's loaded
        }
    } catch (e: any) {
        ctx.logger.warn(`[WARN] Could not load prompt for ${persona}: ${e.message}`);
    }

    ctx.memory.hasRunSystemPrompt = true;
    return 'CONTINUE';
});

// ==================== NAVIGATION STEPS ====================

/**
 * Check/update task status
 */
export const lookupTask = () => step('lookupTask', async (ctx) => {
    if (!ctx.memory.taskStatus) {
        ctx.memory.taskStatus = 'pending';
    }

    // Log current task if exists
    if (ctx.memory.currentTask) {
        ctx.logger.info(`[TASK] ${ctx.memory.currentTask.description} (${ctx.memory.taskStatus})`);
    }

    return 'CONTINUE';
});

// ==================== COORDINATION STEPS ====================

/**
 * Wait for file to appear AND detect if it changed since last read
 */
export const awaitFile = (filePathKey: 'reportFile' | 'directiveFile') =>
    step(`awaitFile:${filePathKey}`, async (ctx) => {
        const filePath = ctx.paths[filePathKey];
        const hashKey = filePathKey === 'reportFile' ? 'lastReportHash' : 'lastDirectiveHash';
        const fileName = path.basename(filePath);

        if (!await fs.pathExists(filePath)) {
            ctx.agent.tell(`WAITING: ${fileName} not found.\nCreate it and run relay again.`);
            return 'WAIT';
        }

        const currentHash = await hashFile(filePath);

        if (ctx.memory[hashKey] === currentHash) {
            ctx.agent.tell(`WAITING: ${fileName} unchanged since last read.\nUpdate it and run relay again.`);
            return 'WAIT';
        }

        // File exists and is new/changed
        ctx.memory[hashKey] = currentHash;
        ctx.logger.info(`[FILE] ${fileName} detected (new or changed)`);
        return 'CONTINUE';
    });

/**
 * Validate and read the Engineer's report
 */
export const readReport = () => step('readReport', async (ctx) => {
    const validator = new Validator();

    try {
        const content = await validator.validateEngineerReport(ctx.paths.reportFile);
        ctx.memory.lastReport = content;

        ctx.logger.info(`\n=== ENGINEER REPORT ===`);
        ctx.logger.info(content);
        ctx.logger.info(`=======================\n`);

        return 'CONTINUE';
    } catch (e: any) {
        ctx.agent.tell(`INVALID REPORT: ${e.message}\nFix the report format and run relay again.`);
        return 'WAIT';
    }
});

/**
 * Validate and read the Architect's directive
 */
export const readDirective = () => step('readDirective', async (ctx) => {
    const validator = new Validator();

    try {
        const content = await validator.validateArchitectDirective(ctx.paths.directiveFile);
        ctx.memory.lastDirective = content;

        ctx.logger.info(`\n=== ARCHITECT DIRECTIVE ===`);
        ctx.logger.info(content);
        ctx.logger.info(`===========================\n`);

        return 'CONTINUE';
    } catch (e: any) {
        ctx.agent.tell(`INVALID DIRECTIVE: ${e.message}\nFix the directive format and run relay again.`);
        return 'WAIT';
    }
});

/**
 * Archive a processed file with timestamp
 */
export const archiveFile = (filePathKey: 'reportFile' | 'directiveFile') =>
    step(`archiveFile:${filePathKey}`, async (ctx) => {
        const filePath = ctx.paths[filePathKey];

        if (await fs.pathExists(filePath)) {
            const archivePath = `${filePath}.archived.${Date.now()}`;
            await fs.rename(filePath, archivePath);
            ctx.logger.info(`[ARCHIVE] ${path.basename(filePath)} → ${path.basename(archivePath)}`);
        }

        return 'CONTINUE';
    });

/**
 * Prompt user to write their file (directive or report)
 * Injects current task context for auto-mode agents
 */
export const promptWrite = (filePathKey: 'reportFile' | 'directiveFile') =>
    step(`promptWrite:${filePathKey}`, async (ctx) => {
        const filePath = ctx.paths[filePathKey];
        const role = filePathKey === 'reportFile' ? 'ENGINEER' : 'ARCHITECT';
        const fileType = filePathKey === 'reportFile' ? 'report' : 'directive';

        // Build context-aware prompt for auto-mode
        let prompt = `
═══════════════════════════════════════════════════════════════════════════════
                              ACTION REQUIRED
═══════════════════════════════════════════════════════════════════════════════

Role: ${role}
Action: Write your ${fileType}
Output: ${filePath}
`;

        // Inject current task if available (for engineer)
        if (ctx.currentTask && role === 'ENGINEER') {
            prompt += `
───────────────────────────────────────────────────────────────────────────────
                              CURRENT TASK
───────────────────────────────────────────────────────────────────────────────

${ctx.currentTask.content}

───────────────────────────────────────────────────────────────────────────────
`;
        }

        // Inject task reference for architect
        if (ctx.currentTask && role === 'ARCHITECT') {
            prompt += `
───────────────────────────────────────────────────────────────────────────────
                         REVIEWING TASK ${ctx.currentTask.id}
───────────────────────────────────────────────────────────────────────────────

Task: ${ctx.currentTask.title}
File: ${ctx.currentTask.filename}

Review the engineer's report against this task's acceptance criteria.

───────────────────────────────────────────────────────────────────────────────
`;
        }

        prompt += `
When finished: ./relay.sh ${role.toLowerCase()}

═══════════════════════════════════════════════════════════════════════════════
`;

        ctx.agent.tell(prompt);

        // Always wait for user to complete their action
        return 'WAIT';
    });

/**
 * Prompt Architect to write directive (legacy compatibility)
 */
export const writeDirective = () => promptWrite('directiveFile');

