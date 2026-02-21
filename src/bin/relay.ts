#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../../package.json';
import fs from 'fs-extra';
import path from 'path';
import { initialize } from '../helpers';
import { FilePersistence } from '../persistence/file-persistence';
import { templateManager } from '../template-manager';

const program = new Command();

program
    .name('relay')
    .description('Relay: Autonomous Agent Orchestrator')
    .version(packageJson.version);

program.command('init')
    .description('Initialize a new Relay project in the current directory')
    .action(async () => {
        try {
            console.log('Initializing Relay...');
            const projectRoot = process.cwd();
            const persistence = new FilePersistence(path.join(projectRoot, '.relay/state.json'));

            initialize(projectRoot, persistence);

            templateManager.initialize(projectRoot);
            templateManager.copyAllDefaultsToProject(projectRoot);

            const cursorSrc = path.join(__dirname, '../cursor'); // dist/bin/../cursor -> dist/cursor
            const cursorDest = path.join(process.cwd(), '.cursor');

            if (await fs.pathExists(cursorSrc)) {
                console.log(`Copying cursor agents to ${cursorDest}...`);
                await fs.copy(cursorSrc, cursorDest, { overwrite: true });
                console.log('Cursor agents installed successfully.');
            } else {
                console.warn(`Warning: source cursor directory not found at ${cursorSrc}`);
            }
        } catch (error: any) {
            console.error('Init failed:', error.message);
            process.exit(1);
        }
    });

program.command('mcp')
    .description('Start the MCP server (stdio transport). Used by Cursor, Windsurf, Claude Desktop.')
    .action(async () => {
        await import('../mcp.js');
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
