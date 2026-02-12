
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../src/shell/mcp.ts');
const TEST_DIR = path.resolve(__dirname, 'e2e-temp');

async function main() {
    console.log('🚀 Starting E2E Test...');

    // Setup Test Environment
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(TEST_DIR, '.relay'), { recursive: true });

    console.log(`Test Dir: ${TEST_DIR}`);
    console.log(`Server: ${SERVER_PATH}`);

    // Hack: Set CWD of the spawned process to TEST_DIR
    // StdioClientTransport doesn't support cwd option directly in constructor args?
    // Actually it does NOT. It uses `spawn(command, args, { env })`.
    // We might need to implement a custom Transport or just use `env` to pass a config if Relay supported it.
    // But Relay relies on CWD.

    // Workaround: We can't easily change CWD of StdioClientTransport. 
    // BUT we can wrap the command. 
    // Command: "cd scripts/e2e-temp && npx tsx ../../src/shell/mcp.ts"

    // Let's try to wrap it in a shell command.
    const relativeServerPath = path.relative(TEST_DIR, SERVER_PATH);

    // Re-instantiate transport with shell wrapper
    const shellTransport = new StdioClientTransport({
        command: 'sh',
        args: ['-c', `cd "${TEST_DIR}" && npx tsx "${relativeServerPath}"`],
    });

    const client = new Client({
        name: 'e2e-client',
        version: '1.0.0',
    }, {
        capabilities: {}
    });

    try {
        await client.connect(shellTransport);
        console.log('✅ Connected to Relay MCP Server');

        // 1. List Tools
        const tools = await client.listTools();
        console.log('🛠️  Available Tools:', tools.tools.map(t => t.name).join(', '));

        if (!tools.tools.find(t => t.name === 'plan_task')) throw new Error('plan_task missing');

        // 2. Plan Task
        console.log('\n📝 Planning Task...');
        const planResult = await client.callTool({
            name: 'plan_task',
            arguments: {
                title: 'E2E Test Task',
                description: 'Verifying MCP server flow'
            }
        }) as any;
        console.log('Result:', planResult);

        // Extract Task ID from output? The output is text.
        // "Task <UUID> started: ..."
        const outputText = (planResult.content[0] as any).text;
        const taskIdMatch = outputText.match(/Task ([a-f0-9-]+) started/);

        if (!taskIdMatch) {
            console.log('Plan Result:', JSON.stringify(planResult, null, 2));
            throw new Error(`Could not extract Task ID from: ${outputText}`);
        }
        const taskId = taskIdMatch[1];
        console.log(`🆔 Task ID: ${taskId}`);

        // 3. Submit Directive
        console.log('\n🗣️  Submitting Directive...');
        await client.callTool({
            name: 'submit_directive',
            arguments: {
                taskId,
                content: '## EXECUTE\n\nDo the thing.',
                decision: 'REJECT' // Start the loop
            }
        });
        console.log('✅ Directive Submitted');

        // 4. Submit Report
        console.log('\n👷 Submitting Report...');
        await client.callTool({
            name: 'submit_report',
            arguments: {
                taskId,
                content: '## CHANGES\n\nI did the thing.',
                status: 'COMPLETED'
            }
        });
        console.log('✅ Report Submitted');

        // 5. Complete Task
        console.log('\n🎉 Completing Task...');
        await client.callTool({
            name: 'submit_directive',
            arguments: {
                taskId,
                content: '## EXECUTE\n\nGood job.',
                decision: 'APPROVE'
            }
        });
        console.log('✅ Task Completed');

    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    } finally {
        // Cleanup
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        await shellTransport.close();
        process.exit(0);
    }
}

main();
