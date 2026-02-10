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

        // Build context-aware prompt for auto-mode
        let prompt = `
═══════════════════════════════════════════════════════════════════════════════
                              ACTION REQUIRED
═══════════════════════════════════════════════════════════════════════════════

Role: ${role}
Action: Fill in the ${fileType}
File: ${filePath}

[INFO] The file has been pre-filled with the required headers.
       DO NOT remove the headers. Fill in the sections.
`;

        // Inject current task if available (for engineer)
        if (ctx.currentTask && role === 'ENGINEER') {
            prompt += `
───────────────────────────────────────────────────────────────────────────────
                              CURRENT TASK
───────────────────────────────────────────────────────────────────────────────

File: ${ctx.currentTask.path}

${ctx.currentTask.content}

───────────────────────────────────────────────────────────────────────────────
`;
        }

        // Inject task reference for architect
        if (ctx.currentTask && role === 'ARCHITECT') {
            prompt += `
## REVIEW CONTEXT: TASK ${ctx.currentTask.id}

Task: ${ctx.currentTask.title}
File: ${ctx.currentTask.filename}

### REQUIREMENTS
${ctx.currentTask.content}

Review the engineer's report against this task's acceptance criteria.
`;
        }

        // Inject Reinforcement Points (Hardening)
        if (role === 'ARCHITECT') {
            prompt += `
## IMPORTANT REMINDERS
1. TRUST NOTHING. Assume the Engineer's code is broken.
2. VERIFY EVERYTHING. Don't just read it; prove it works.
3. ZERO TOLERANCE. If you find a single flaw, REJECT. Do not "fix it later".
4. YOU ARE THE GATEKEEPER. Bad code results in mission failure.
`;
        } else if (role === 'ENGINEER') {
            prompt += `
## IMPORTANT REMINDERS
1. OBEY THE DIRECTIVE. Do not improvise.
2. VERIFY YOUR WORK. Unverified code is broken code.
3. REPORT REALITY. If it fails, report FAILED. Do not lie.
`;
        }

        prompt += `
## FINAL STEP

When you have filled the file, you MUST run this command to submit:

> relay ${role.toLowerCase()} ${ctx.args.feature} pulse

If you do not run this, your work will be discarded.
`;

        // Inject Coding Guidelines (if present in .relay root)
        // workDir is features/<feature>, so .relay is ../..
        const relayDir = path.resolve(ctx.paths.workDir, '..', '..');
        const guidelinesPath = path.join(relayDir, 'CODING_GUIDELINES.md');

        if (await fs.pathExists(guidelinesPath)) {
            const guidelines = await fs.readFile(guidelinesPath, 'utf-8');
            prompt += `
## CODING GUIDELINES
${guidelines}
`;
        }

        ctx.agent.tell(prompt);

        // Always wait for user to complete their action
        return 'WAIT';
    });

/**
 * Prompt Architect to write directive (legacy compatibility)
 */
export const writeDirective = () => promptWrite('directiveFile');

