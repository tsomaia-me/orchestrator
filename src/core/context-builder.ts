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
import { validateTaskId } from './paths';

/** Audit b79b0667: Reject prototype pollution keys */
const UNSAFE_INJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class ContextBuilder {
    constructor(
        private store: Store,
        private exchange: ExchangeManager,
        private rootDir: string
    ) { }

    async build(role: 'architect' | 'engineer', state: RelayState, model?: string): Promise<PromptContext> {
        // 1. Task (Audit b79b0667: validate activeTaskId, use readSafeFile)
        let task = undefined;
        let validTaskId: string | null = null;
        if (state.activeTaskId) {
            try {
                validateTaskId(state.activeTaskId);
                validTaskId = state.activeTaskId;
            } catch {
                // Corrupted state: skip task
            }
        }
        if (validTaskId) {
            const relPath = path.join('.relay', 'tasks', `${validTaskId}.md`);
            const content = await readSafeFile(this.rootDir, relPath);
            if (content !== null && content !== '<<ERROR: FILE_TOO_LARGE>>') {
                task = {
                    id: validTaskId,
                    title: state.activeTaskTitle || 'Unknown Task',
                    path: relPath,
                    content
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

        // 5. Injections (Audit b79b0667: Object.create(null), reject __proto__/constructor)
        const custom = Object.create(null) as Record<string, string>;
        if (config.inject) {
            for (const [key, relPath] of Object.entries(config.inject as Record<string, string>)) {
                if (UNSAFE_INJECT_KEYS.has(key)) continue;
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
