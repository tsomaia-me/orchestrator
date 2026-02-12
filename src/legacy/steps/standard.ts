import { RelayStep, step } from '../core/step';
import { PromptLoader } from '../core/prompts';
import { Validator } from '../core/validator';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import crypto from 'crypto';
import { getNextPendingTask, TaskFile } from '../core/feature';
import { getNextExchangePath, getLatestExchangeToRead } from '../core/exchange';
import { StateManager } from '../core/state';

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
    // Smart Resume / Auto-Advance Logic

    // If no context about current task, or it is done (approved), find next
    if (!ctx.memory.currentTask || ctx.memory.status === 'approved') {
        const projectRoot = path.resolve(ctx.paths.workDir, '..', '..', '..');
        const nextTask = await getNextPendingTask(projectRoot, ctx.args.feature);

        if (nextTask) {
            ctx.memory.currentTask = nextTask.id;
            ctx.memory.currentTaskSlug = nextTask.slug;
            ctx.memory.taskStatus = 'pending';

            // Update context with full task object so subsequent steps have it
            ctx.currentTask = nextTask;

            // SAVE STATE IMMEDIATELY so getNextExchangePath (which reads from disk) sees the new task
            const stateManager = new StateManager(ctx.paths.workDir);
            await stateManager.save(ctx.memory);

            // CRITICAL: Update paths now that we have a task
            try {
                const featureName = ctx.args.feature;
                // projectRoot is already defined correctly above

                // We need to determine paths based on the NEW task
                // This mimics logic in cli.ts but does it dynamically
                const role = ctx.persona; // 'architect' or 'engineer'

                if (role === 'architect') {
                    // Architect writes directive, reads report
                    const { path: dirPath, iteration } = await getNextExchangePath(projectRoot, featureName, 'architect');
                    ctx.paths.directiveFile = dirPath;
                    ctx.memory.iteration = iteration;

                    // Architect reads latest report (if any)
                    const reportPath = await getLatestExchangeToRead(projectRoot, featureName, 'architect');
                    if (reportPath) {
                        ctx.paths.reportFile = reportPath;
                    } else if (iteration === 1) {
                        // First iteration: No report exists yet. Don't wait for it.
                        delete ctx.paths.reportFile;
                    }

                } else if (role === 'engineer') {
                    // Engineer writes report, reads directive
                    const { path: repPath, iteration } = await getNextExchangePath(projectRoot, featureName, 'engineer');
                    ctx.paths.reportFile = repPath;
                    ctx.memory.iteration = iteration;

                    // Engineer reads latest directive
                    const dirPath = await getLatestExchangeToRead(projectRoot, featureName, 'engineer');
                    if (dirPath) {
                        ctx.paths.directiveFile = dirPath;
                    } else {
                        // Predict expected directive path if missing
                        const featureDir = ctx.paths.workDir;
                        ctx.paths.directiveFile = path.join(featureDir, 'exchange',
                            `${nextTask.id}-${String(iteration).padStart(3, '0')}-architect-${nextTask.slug}.md`
                        );
                    }
                }

                ctx.logger.info(`[AUTO] Paths updated for Task ${nextTask.id}`);
            } catch (e: any) {
                ctx.logger.warn(`[WARN] Failed to update paths for auto-selected task: ${e.message}`);
            }

            ctx.logger.info(`[AUTO] Selected Task: ${nextTask.id} - ${nextTask.title}`);
        } else {
            // No pending tasks. Empty state?
            if (!ctx.memory.currentTask) {
                // New feature, no tasks
                ctx.logger.info(`[INFO] No tasks found.`);

                // Prompt to create scaffold
                const { confirm } = await inquirer.prompt({
                    type: 'confirm',
                    name: 'confirm',
                    message: 'No tasks found. Create 001-setup.md scaffold?',
                    default: true
                });

                if (confirm) {
                    const tasksDir = path.join(ctx.paths.workDir, 'tasks');
                    await fs.ensureDir(tasksDir);
                    await fs.writeFile(
                        path.join(tasksDir, '001-setup.md'),
                        `# Task 001: Setup\n\n- [ ] Initialize project structure\n`
                    );
                    ctx.logger.info(`[CREATED] 001-setup.md. Re-run pulse to begin.`);
                    return 'STOP';
                }
            } else {
                ctx.logger.info(`[INFO] All tasks approved!`);
            }
        }
    }

    if (!ctx.memory.taskStatus) {
        ctx.memory.taskStatus = 'pending';
    }

    // Log current task if exists
    if (ctx.currentTask) {
        ctx.logger.info(`[TASK] ${ctx.currentTask.title} (${ctx.memory.taskStatus})`);
    } else if (ctx.memory.currentTask) {
        ctx.logger.info(`[TASK] ${ctx.memory.currentTask} (${ctx.memory.taskStatus})`);
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
        if (!filePath) return 'CONTINUE';

        const hashKey = filePathKey === 'reportFile' ? 'lastReportHash' : 'lastDirectiveHash';
        const fileName = path.basename(filePath);

        if (!await fs.pathExists(filePath)) {
            // BLOCKING MODE (Pulse)
            if (ctx.lock) {
                ctx.logger.info(`[WAIT] Waiting for ${fileName}...`);
                await ctx.lock.release();

                // Poll until file exists
                while (!await fs.pathExists(filePath)) {
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Re-acquire lock to continue safely
                try {
                    await ctx.lock.acquire();
                } catch (e) {
                    ctx.logger.error("Failed to re-acquire lock after waiting.");
                    process.exit(1);
                }

                // Continue execution (don't return WAIT, we found it!)
            } else {
                ctx.agent.tell(`WAITING: ${fileName} not found.\nCreate it and run relay again.`);
                return 'WAIT';
            }
        }

        const currentHash = await hashFile(filePath);

        if (ctx.memory[hashKey] === currentHash) {
            // BLOCKING MODE (Pulse) - Content unchanged
            if (ctx.lock) {
                ctx.logger.info(`[WAIT] Waiting for ${fileName} to update...`);
                await ctx.lock.release();

                // Poll until hash changes
                while (await hashFile(filePath) === currentHash) {
                    await new Promise(r => setTimeout(r, 1000));
                }

                try {
                    await ctx.lock.acquire();
                } catch (e) {
                    ctx.logger.error("Failed to re-acquire lock after waiting.");
                    process.exit(1);
                }
            } else {
                ctx.agent.tell(`WAITING: ${fileName} unchanged since last read.\nUpdate it and run relay again.`);
                return 'WAIT';
            }
        }

        // File exists and is new/changed
        ctx.memory[hashKey] = await hashFile(filePath); // Re-hash to get new value
        ctx.logger.info(`[FILE] ${fileName} detected (new or changed)`);
        return 'CONTINUE';
    });

/**
 * Validate and read the Engineer's report
 */
export const readReport = () => step('readReport', async (ctx) => {
    if (!ctx.paths.reportFile) return 'CONTINUE';

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
    if (!ctx.paths.directiveFile) return 'CONTINUE';

    const validator = new Validator();

    try {
        const content = await validator.validateArchitectDirective(ctx.paths.directiveFile);
        ctx.memory.lastDirective = content;

        ctx.logger.info(`\n=== ARCHITECT DIRECTIVE ===`);
        ctx.logger.info(content);
        ctx.logger.info(`===========================\n`);

        // Check for APPROVE verdict
        if (content.match(/##\s*VERDICT\s*\n\s*APPROVE/i)) {
            ctx.logger.info(`\n🎉  TASK APPROVED by Architect. Exiting.\n`);
            if (ctx.featureState) {
                ctx.featureState.status = 'approved';
                ctx.featureState.currentTask = ''; // Clear current task
            }
            return 'STOP';
        }

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
        if (!filePath) return 'CONTINUE';

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
        if (!filePath) {
            ctx.logger.error(`[ERROR] No path defined for ${filePathKey}. Cannot prompt.`);
            return 'STOP';
        }

        const role = filePathKey === 'reportFile' ? 'ENGINEER' : 'ARCHITECT';
        const fileType = filePathKey === 'reportFile' ? 'report' : 'directive';

        // -------------------------------------------------------------------------
        // BUREAUCRACY ELIMINATION: Pre-fill the file with headers
        // -------------------------------------------------------------------------
        let template = '';
        if (role === 'ENGINEER') {
            template = `# REPORT\n\nTarget: ${ctx.currentTask?.id || 'UNKNOWN'}\nStatus: [COMPLETED | FAILED | BLOCKED]\n\n## CHANGES\n- \n\n## VERIFICATION\n- \n\n## ISSUES\n- None\n`;
        } else {
            template = `# DIRECTIVE\n\nTarget: ${ctx.currentTask?.id || 'UNKNOWN'}\n\n## EXECUTE\n1. \n\n## CRITIQUE (If Rejecting)\n1. \n\n## VERDICT\n[APPROVE | REJECT]\n`;
        }

        // Only write template if file doesn't exist or is empty
        if (!await fs.pathExists(filePath) || (await fs.stat(filePath)).size === 0) {
            await fs.writeFile(filePath, template);
            ctx.logger.info(`[AUTO] Pre-filled ${fileType} template at ${path.basename(filePath)}`);
        }
        // -------------------------------------------------------------------------

        // CHECK: If the file is already valid (completed), do not prompt again.
        const validator = new Validator();
        let isValid = false;
        try {
            if (role === 'ENGINEER') {
                await validator.validateEngineerReport(filePath);
            } else {
                await validator.validateArchitectDirective(filePath);
            }
            isValid = true;
        } catch (e) {
            // Validation failed
        }

        // AUTO-SUBMIT MODE
        if (ctx.args.submit) {
            if (isValid) {
                ctx.logger.info(`[SUBMIT] ${fileType} submitted successfully.`);
                return 'CONTINUE';
            } else {
                ctx.logger.error(`[ERROR] Cannot submit ${fileType}: Validation failed.`);
                process.exit(1);
            }
        }

        // If not submitting, and it's valid, we are waiting for user to run submit
        if (isValid) {
            ctx.logger.info(`[WAIT] ${fileType} is valid. Waiting for explicit submission.`);

            ctx.agent.tell(`
STATUS: ${fileType} is VALID.
ACTION: Run this command to submit and proceed:

> relay ${role.toLowerCase()} ${ctx.args.feature} pulse --submit
`);
            return 'STOP'; // Exit process, wait for user command
        }

        // Build context-aware prompt for auto-mode
        // HARDENED PROMPT - NO FLUFF
        let prompt = `
###############################################################################
                       🚀 ACTION REQUIRED: ${role}
###############################################################################

1. EDIT the file below (It has been pre-created/filled):
   👉 ${filePath}

`;

        // Inject current task if available (for engineer)
        if (ctx.currentTask && role === 'ENGINEER') {
            prompt += `
2. IMPLEMENT this Task:
   File: ${ctx.currentTask.path}
   -------------------------------------------------------
${ctx.currentTask.content}
   -------------------------------------------------------
`;
        }

        // Inject task reference for architect
        if (ctx.currentTask && role === 'ARCHITECT') {
            prompt += `
2. REVIEW Engineer's Report (in file above) against Task ${ctx.currentTask.id}:
   Task File: ${ctx.currentTask.filename}
   -------------------------------------------------------
${ctx.currentTask.content}
   -------------------------------------------------------
`;
        }

        prompt += `
3. VERIFY your work.
   - If Architect: Ensure code is flawless. REJECT if any doubt.
   - If Engineer: Ensure logic works. NO GUESSING.

4. SUBMIT when ready:
   
   > relay ${role.toLowerCase()} ${ctx.args.feature} pulse --submit

###############################################################################
`;

        ctx.agent.tell(prompt);

        // Always wait for user to complete their action
        return 'WAIT';
    });

/**
 * Prompt Architect to write directive (legacy compatibility)
 */
export const writeDirective = () => promptWrite('directiveFile');
