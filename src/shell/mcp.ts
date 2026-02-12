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
    // relay://context/{role} -> Returns State + Instructions + Last Content
    server.resource(
        'context',
        'relay://context/{role}',
        async (uri) => {
            // Manual parsing for role from URI path
            // URI is like relay://context/architect
            const url = new URL(uri.href);
            const parts = url.pathname.split('/');
            // pathname might be /architect or //context/architect depending on parsing
            // Let's grab the last segment
            const role = parts[parts.length - 1] as Role;

            if (!['architect', 'engineer'].includes(role)) {
                throw new Error('Invalid role. Use architect or engineer.');
            }

            const state = await store.read();
            const lastContent = await exchange.getLatestContent(state);
            const instructions = getInstructionsForRole(state, role);

            const contextView = {
                role,
                state,
                instructions,
                // Content of the *other* agent's last turn (Directive or Report) logic is inside getLatestContent
                lastExchangeContent: lastContent
            };

            return {
                contents: [{
                    uri: uri.href,
                    text: JSON.stringify(contextView, null, 2),
                    mimeType: 'application/json',
                }],
            };
        }
    );

    // Resource: Prompts
    // relay://prompts/{role}
    server.resource(
        'prompts',
        'relay://prompts/{role}',
        async (uri) => {
            const url = new URL(uri.href);
            const parts = url.pathname.split('/');
            const role = parts[parts.length - 1];

            if (!['architect', 'engineer'].includes(role)) {
                throw new Error(`Invalid role for prompts: ${role}`);
            }

            // Ideally prompts are in packageRoot/prompts/mcp/
            // We assume we are running from dist/shell/mcp.js or src/shell/mcp.ts
            // So go up 2 levels -> src/ -> then up to root -> then prompts/mcp
            // Or if in dist: dist/shell -> dist -> root

            // Robust way: find package.json? Or just assume standard layout.
            // Let's try to resolve relative to __dirname
            const packageRoot = path.resolve(__dirname, '..', '..');
            // In src: src/shell/../../ -> root
            // In dist: dist/shell/../../ -> root

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
                // Fallback
                return {
                    contents: [{
                        uri: uri.href,
                        text: `System Prompt not found at ${promptPath}. You are the ${role}.`,
                        mimeType: 'text/plain',
                    }],
                };
            }
        }
    );

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
            // TODO: Maybe write the initial task scaffold to disk in tasks/ ?
            // For now, metadata kept in state.

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
                const action = { type: 'SUBMIT_DIRECTIVE', taskId: args.taskId } as const;
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
