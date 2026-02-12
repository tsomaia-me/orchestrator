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
import { validateTaskId } from '../core/paths';
import { TOOLS } from './tools';
import { Role } from '../core/state';
import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'node:crypto';

async function main() {
    // 1. Initialize Adapters
    const rootDir = await Store.findRoot() || process.cwd();

    const exchange = new ExchangeManager(rootDir);
    const store = new Store(rootDir, exchange);

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
                try {
                    const { state, lastExchangeContent } = await store.readContext();
                    const instructions = getInstructionsForRole(state, role);

                    const contextView = {
                        role,
                        state,
                        instructions,
                        lastExchangeContent
                    };

                    console.error(`Serving context for ${role}: ${state.status}`);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify(contextView, null, 2),
                            mimeType: 'application/json',
                        }],
                    };
                } catch (err: any) {
                    console.error(`Context resource error for ${role}:`, err);
                    const errorView = { error: String(err?.message ?? err), role };
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify(errorView, null, 2),
                            mimeType: 'application/json',
                        }],
                    };
                }
            }
        );

        // Prompts Resource
        server.resource(
            `prompt-${role}`,
            `relay://prompts/${role}`,
            async (uri) => {
                try {
                    // V-06: Robust package root resolution for dist, symlinked, or bundled installs
                    let packageRoot = path.resolve(__dirname, '..', '..');
                    if (!(await fs.pathExists(path.join(packageRoot, 'prompts', 'mcp')))) {
                        try {
                            packageRoot = path.dirname(
                                require.resolve('orchestrator-relay/package.json', { paths: [process.cwd(), __dirname] })
                            );
                        } catch {
                            // Finding 5: Do not fallback to process.cwd(); keep packageRoot to return "System Prompt not found."
                        }
                    }
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
                } catch (err: any) {
                    console.error(`Prompts resource error for ${role}:`, err);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: `System Prompt failed to load: ${err?.message ?? err}`,
                            mimeType: 'text/plain',
                        }],
                    };
                }
            }
        );
    }

    // 4. Register Tools

    // Tool: Plan Task
    // Remediation F2: Write state first, then side-effects (prevents ghost writes)
    server.tool(
        TOOLS.plan_task.name,
        TOOLS.plan_task.description,
        TOOLS.plan_task.schema.shape,
        async (args) => {
            try {
                const { title, description } = args;
                const taskId = randomUUID();
                const action = {
                    type: 'START_TASK',
                    taskId,
                    taskTitle: title,
                    timestamp: Date.now()
                } as const;

                const newState = await store.updateWithSideEffect(
                    (state) => {
                        validateAction(state, action);
                        return reducer(state, action);
                    },
                    async () => {
                        const logPath = path.join(rootDir, '.relay', 'tasks.jsonl');
                        const logEntry = JSON.stringify({
                            id: taskId,
                            title,
                            status: 'planning',
                            createdAt: new Date(action.timestamp).toISOString()
                        }) + '\n';
                        await fs.appendFile(logPath, logEntry, 'utf-8');
                    }
                );

                return {
                    content: [{ type: 'text', text: `Task ${taskId} started: ${title}` }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Error starting task: ${error.message}` }],
                };
            }
        }
    );

    // Tool: Submit Directive
    // Remediation F2: Write state first, then side-effects
    server.tool(
        TOOLS.submit_directive.name,
        TOOLS.submit_directive.description,
        TOOLS.submit_directive.schema.shape,
        async (args) => {
            try {
                validateTaskId(args.taskId);
                const action = {
                    type: 'SUBMIT_DIRECTIVE',
                    taskId: args.taskId,
                    decision: args.decision,
                    timestamp: Date.now()
                } as const;

                await store.updateWithExchange(
                    (state) => {
                        validateAction(state, action);
                        return reducer(state, action);
                    },
                    async (newState) => {
                        await exchange.writeExchange(
                            newState.activeTaskId!,
                            newState.activeTaskTitle!,
                            newState.iteration,
                            'architect',
                            args.content
                        );
                    }
                );

                return {
                    content: [{ type: 'text', text: `Directive submitted for task ${args.taskId}` }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Error submitting directive: ${error.message}` }],
                };
            }
        }
    );

    // Tool: Submit Report
    // Remediation F2: Write state first, then side-effects
    server.tool(
        TOOLS.submit_report.name,
        TOOLS.submit_report.description,
        TOOLS.submit_report.schema.shape,
        async (args) => {
            try {
                validateTaskId(args.taskId);
                const action = {
                    type: 'SUBMIT_REPORT',
                    taskId: args.taskId,
                    status: args.status,
                    timestamp: Date.now()
                } as const;

                await store.updateWithExchange(
                    (state) => {
                        validateAction(state, action);
                        return reducer(state, action);
                    },
                    async (newState) => {
                        await exchange.writeExchange(
                            newState.activeTaskId!,
                            newState.activeTaskTitle!,
                            newState.iteration,
                            'engineer',
                            args.content
                        );
                    }
                );

                return {
                    content: [{ type: 'text', text: `Report submitted for task ${args.taskId}` }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Error submitting report: ${error.message}` }],
                };
            }
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
