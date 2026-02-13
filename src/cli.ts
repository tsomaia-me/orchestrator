/**
 * SHELL: CLI Entrypoint (User Command Handling)
 * Currently supports:
 * - relay init: Bootstrap .relay folder
 */

import { Command } from 'commander';
import { bootstrap } from './shell/bootstrap';
import packageJson from '../package.json';

const program = new Command();

program
    .name('relay')
    .description('Relay: Autonomous Agent Orchestrator')
    .version(packageJson.version);

program.command('init')
    .description('Initialize a new Relay project in the current directory')
    .action(async () => {
        try {
            await bootstrap(process.cwd());
        } catch (error: any) {
            console.error('Init failed:', error.message);
            process.exit(1);
        }
    });

program.command('mcp')
    .description('Start the MCP server (stdio transport). Used by Cursor, Windsurf, Claude Desktop.')
    .action(async () => {
        await import('./shell/mcp.js');
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
