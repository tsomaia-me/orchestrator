/**
 * CORE: Context Builder
 * Assembles the PromptContext from Store, Exchange, and Files.
 */

import { Store } from '../shell/store';
import { ExchangeManager } from '../shell/exchange';
import { PromptContext } from './types/context';
import path from 'path';
import fs from 'fs-extra';
import { TOOLS } from '../shell/tools';
import { RelayState } from './state';
import packageJson from '../../package.json'; // Ensure resolveJsonModule is true
import { readSafeFile } from './io';

export class ContextBuilder {
    constructor(
        private store: Store,
        private exchange: ExchangeManager,
        private rootDir: string
    ) { }

    async build(role: 'architect' | 'engineer', state: RelayState, model?: string): Promise<PromptContext> {
        // 1. Task
        let task = undefined;
        if (state.activeTaskId) {
            const taskPath = path.join(this.rootDir, '.relay', 'tasks', `${state.activeTaskId}.md`);
            if (await fs.pathExists(taskPath)) {
                task = {
                    id: state.activeTaskId,
                    title: state.activeTaskTitle || 'Unknown Task',
                    path: path.relative(this.rootDir, taskPath),
                    content: await fs.readFile(taskPath, 'utf-8')
                };
            }
        }

        // 2. Exchange (History)
        const history = await this.exchange.getTaskHistory(state.activeTaskId || 'none');
        const last = history.length > 0 ? history[history.length - 1] : undefined;

        // 3. Project Environment
        const rulesPath = path.join(this.rootDir, '.relay', 'rules.md');
        const rules = (await fs.pathExists(rulesPath))
            ? await fs.readFile(rulesPath, 'utf-8')
            : undefined;

        const configPath = path.join(this.rootDir, '.relay', 'config.json');
        const config = (await fs.pathExists(configPath))
            ? await fs.readJson(configPath)
            : {};

        // 4. Tools
        const toolDefs = Object.values(TOOLS).map(t => ({
            name: t.name,
            description: t.description,
            schema: JSON.stringify(t.schema)
        }));

        // 5. Injections
        const custom: Record<string, string> = {};
        if (config.inject) {
            for (const [key, relPath] of Object.entries(config.inject as Record<string, string>)) {
                try {
                    const content = await readSafeFile(this.rootDir, relPath);
                    if (content !== null) {
                        custom[key] = content;
                    }
                } catch (err) {
                    console.error(`Failed to inject ${key}:`, err);
                }
            }
        }

        return {
            role,
            state,
            task,
            exchange: { last, history },
            project: {
                root: this.rootDir,
                rules,
                config
            },
            env: {
                cwd: this.rootDir,
                version: packageJson.version,
                tools: toolDefs,
                model
            },
            custom
        };
    }
}
