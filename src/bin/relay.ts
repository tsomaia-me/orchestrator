#!/usr/bin/env node
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import readline from 'readline';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'node:fs';

const PORT = 3456;
const DAEMON_URL = `http://localhost:${PORT}`;

async function isDaemonRunning() {
    try {
        const res = await fetch(`${DAEMON_URL}/ping`);
        return res.status === 200;
    } catch {
        return false;
    }
}

async function startDaemon() {
    const dir = path.join(__dirname, '..');
    const mcpJs = path.join(dir, 'mcp.js');
    const mcpTs = path.join(dir, 'mcp.ts');
    const mcpPath = fs.existsSync(mcpJs) ? mcpJs : mcpTs;
    const isJs = mcpPath.endsWith('.js');

    const p = spawn(isJs ? 'node' : 'npx', isJs ? [mcpPath] : ['tsx', mcpPath], {
        detached: true,
        stdio: 'ignore'
    });
    p.unref();

    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await isDaemonRunning()) return;
    }
    throw new Error('Daemon failed to start');
}

async function main() {
    if (!(await isDaemonRunning())) {
        await startDaemon();
    }

    const transport = new SSEClientTransport(new URL(`${DAEMON_URL}/sse`));
    await transport.start();

    transport.onmessage = (msg) => {
        process.stdout.write(JSON.stringify(msg) + '\n');
    };

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on('line', async (line) => {
        if (!line.trim()) return;
        try {
            const msg = JSON.parse(line);
            await transport.send(msg);
        } catch (e) {
            // Ignore invalid JSON lines from IDE
        }
    });

    transport.onclose = () => {
        process.exit(0);
    };
}

main().catch((err) => {
    console.error('Bridge Error:', err);
    process.exit(1);
});
