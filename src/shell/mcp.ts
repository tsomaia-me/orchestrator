/**
 * SHELL: MCP Server Entrypoint
 * The Imperative Shell that wires everything together.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Store } from './store';
import { ExchangeManager } from './exchange';
import { reducer } from '../core/machine';
import { validateAction, getInstructionsForRole } from '../core/rules';
import { TOOLS } from './tools';
import { Role } from '../core/state';
import fs from 'fs-extra';
import path from 'path';

async function main() {
    // 1. Initialize Adapters
    const rootDir = await Store.findRoot() || process.cwd();

    const store = new Store(rootDir);
    const exchange = new ExchangeManager(rootDir);

    await store.init();
    await exchange.init();

    // 2. Initialize MCP Server
    const server = new McpServer({
        name: 'relay',
        version: '2.0.0',
    });

    // 3. Register Resources
    const ROLES = ['architect', 'engineer'] as const;

    for (const role of ROLES) {
        // Context Resource
        server.resource(
            `context-${role}`,
            `relay://context/${role}`,
            async (uri) => {
                const state = await store.read();
                const lastContent = await exchange.getLatestContent(state);
                const instructions = getInstructionsForRole(state, role);

                const contextView = {
                    role,
                    state,
                    instructions,
                    lastExchangeContent: lastContent
                };

                // Debug log
                console.error(`Serving context for ${role}: ${state.status}`);
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(contextView, null, 2),
                        mimeType: 'application/json',
                    }],
                };
            }
        );

        // Prompts Resource
        server.resource(
            `prompt-${role}`,
            `relay://prompts/${role}`,
            async (uri) => {
                const packageRoot = path.resolve(__dirname, '..', '..');
                const promptPath = path.join(packageRoot, 'prompts', 'mcp', `${role}.md`);

                if (await fs.pathExists(promptPath)) {
                    const content = await fs.readFile(promptPath, 'utf-8');
                    return {
                        contents: [{
                            uri: uri.href,
                            text: content,
                            mimeType: 'text/plain',
                        }],
                    };
                } else {
                    return {
                        contents: [{
                            uri: uri.href,
                            text: `System Prompt not found for ${role}.`,
                            mimeType: 'text/plain',
                        }],
                    };
                }
            }
        );
    }

    // 4. Register Tools

    // Tool: Plan Task
    server.tool(
        TOOLS.plan_task.name,
        TOOLS.plan_task.description,
        TOOLS.plan_task.schema.shape,
        async (args) => {
            const { title, description } = args;
            const taskId = String(Date.now()).slice(-6);

            await store.update((state) => {
                const action = { type: 'START_TASK', taskId, taskTitle: title } as const;
                validateAction(state, action);
                return reducer(state, action);
            });

            // Log task to .relay/tasks.jsonl (append-only) for structured visibility
            const logPath = path.join(rootDir, '.relay', 'tasks.jsonl');
            const logEntry = JSON.stringify({
                id: taskId,
                title,
                status: 'planning',
                createdAt: new Date().toISOString()
            }) + '\n';
            await fs.appendFile(logPath, logEntry, 'utf-8');

            return {
                content: [{ type: 'text', text: `Task ${taskId} started: ${title}` }],
            };
        }
    );

    // Tool: Submit Directive
    server.tool(
        TOOLS.submit_directive.name,
        TOOLS.submit_directive.description,
        TOOLS.submit_directive.schema.shape,
        async (args) => {
            const newState = await store.update((state) => {
                const action = {
                    type: 'SUBMIT_DIRECTIVE',
                    taskId: args.taskId,
                    decision: args.decision
                } as const;
                validateAction(state, action);
                return reducer(state, action);
            });

            await exchange.writeExchange(
                newState.activeTaskId!,
                newState.activeTaskTitle!,
                newState.iteration,
                'architect',
                args.content
            );

            return {
                content: [{ type: 'text', text: `Directive submitted for task ${args.taskId}` }],
            };
        }
    );

    // Tool: Submit Report
    server.tool(
        TOOLS.submit_report.name,
        TOOLS.submit_report.description,
        TOOLS.submit_report.schema.shape,
        async (args) => {
            const newState = await store.update((state) => {
                const action = {
                    type: 'SUBMIT_REPORT',
                    taskId: args.taskId,
                    status: args.status
                } as const;
                validateAction(state, action);
                return reducer(state, action);
            });

            await exchange.writeExchange(
                newState.activeTaskId!,
                newState.activeTaskTitle!,
                newState.iteration,
                'engineer',
                args.content
            );

            return {
                content: [{ type: 'text', text: `Report submitted for task ${args.taskId}` }],
            };
        }
    );

    // 5. Connect Transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`Relay MCP Server running at ${rootDir}`);
}

main().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
