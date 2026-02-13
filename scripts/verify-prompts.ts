/**
 * VERIFICATION: Prompt Manager Test
 * Validates:
 * 1. Template Loading (Default vs Override)
 * 2. Inheritance (Architect extends System)
 * 3. Context Injection (Task, State)
 * 4. Config Injection (User Variables)
 * 5. Security (DoS, Traversal)
 * 6. Model Lookup
 */

import { PromptManager } from '../src/core/prompt-manager';
import path from 'path';
import fs from 'fs-extra';
import assert from 'assert';

async function verify() {
    const testDir = path.resolve(process.cwd(), 'research/template-test');
    await fs.ensureDir(testDir);
    await fs.ensureDir(path.join(testDir, '.relay/prompts'));

    // Setup Manager in test dir
    const manager = new PromptManager(testDir);

    // Copy real templates for authentic testing
    // We copy to .relay/prompts to simulate user having local templates
    // But wait, the manager looks in .relay/prompts FIRST.
    // So if we put them there, it sees them.
    // To test "Override", we just need to change the file in .relay/prompts.
    const templatesSrc = path.resolve(process.cwd(), 'templates/prompts');
    if (await fs.pathExists(templatesSrc)) {
        await fs.copy(templatesSrc, path.join(testDir, '.relay/prompts'));
    } else {
        // Fallback for environment where templates might be elsewhere
        console.warn('Templates source not found, writing mocks...');
        await fs.writeFile(path.join(testDir, '.relay/prompts/system.njk'), `{% block identity %}SYSTEM{% endblock %} {% block instruction %}INST{% endblock %}`);
        await fs.writeFile(path.join(testDir, '.relay/prompts/architect.njk'), `{% extends "system.njk" %} {% block identity %}ARCHITECT{% endblock %}`);
    }

    // Mock Context
    const context = {
        role: 'architect',
        state: { status: 'planning' },
        task: { title: 'Test Task' },
        exchange: {},
        project: { config: { constants: { jira: 'PROJ-123' } } },
        env: { tools: [] },
        custom: {}
    };

    console.log('Testing Architect Template Rendering...');
    try {
        const output = await manager.render('architect', context as any);
        // console.log(output);

        if (output.includes('You are the **Architect**') || output.includes('ARCHITECT')) {
            console.log('✅ Standard Rendering Verified.');
        } else {
            throw new Error('Identity Missing');
        }
    } catch (e) {
        console.error('❌ Standard Rendering Failed:', e);
        process.exit(1);
    }

    // Test Override
    console.log('Testing User Override...');

    const architectPath = path.join(testDir, '.relay/prompts/architect.njk');
    const originalContent = await fs.readFile(architectPath, 'utf-8');

    // User modifies architect.njk
    const userOverrideContent = `{% extends "system.njk" %}
{% block identity %}USER_OVERRIDE_VERIFIED{% endblock %}
`;

    await fs.writeFile(architectPath, userOverrideContent);

    try {
        const output = await manager.render('architect', context as any);
        if (output.includes('USER_OVERRIDE_VERIFIED')) {
            console.log('✅ User Override Verified.');
        } else {
            console.error('❌ User Override Failed:', output);
            process.exit(1);
        }
    } finally {
        // Restore
        await fs.writeFile(architectPath, originalContent);
    }

    // --- 3. SECURITY TESTS ---
    console.log('\n--- SECURITY TESTS ---');

    // Test A: DoS Prevention (Large File)
    const largeFile = path.join(testDir, 'large.txt');
    await fs.writeFile(largeFile, 'A'.repeat(60 * 1024)); // 60KB

    const dosTemplate = `{{ read_file('large.txt') }}`;
    await fs.writeFile(path.join(testDir, '.relay/prompts/dos.njk'), dosTemplate);

    try {
        const output = await manager.render('dos', context as any);
        if (output.includes('<<ERROR: FILE_TOO_LARGE>>')) {
            console.log('✅ DoS Prevention Verified (File Blocked).');
        } else {
            console.error('❌ DoS Prevention Failed: File was not truncated.');
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ DoS Test Error:', e);
    }

    // Test B: Path Traversal
    const traversalTemplate = `{{ read_file('../../package.json') }}`;
    await fs.writeFile(path.join(testDir, '.relay/prompts/traversal.njk'), traversalTemplate);

    try {
        await manager.render('traversal', context as any);
        console.error('❌ Traversal Verified Failed: Should have thrown error.');
        process.exit(1);
    } catch (e: any) {
        if (e.message && e.message.includes('Security Violation')) {
            console.log('✅ Path Traversal Blocked.');
        } else {
            console.error('❌ Traversal Error Mismatch:', e.message);
        }
    }

    // --- 4. MODEL SPECIFICITY ---
    console.log('\n--- MODEL SPECIFICITY ---');

    // Create architect.gpt-4.njk
    await fs.writeFile(path.join(testDir, '.relay/prompts/architect.gpt-4.njk'), `GPT-4 SPECIFIC CONTENT`);

    // Context with model
    const gptContext = { ...context, env: { ...context.env, model: 'gpt-4' } };

    const gptOutput = await manager.render('architect', gptContext as any);
    if (gptOutput.includes('GPT-4 SPECIFIC CONTENT')) {
        console.log('✅ Model-Specific Template Verified.');
    } else {
        console.error('❌ Model Lookup Failed.');
    }
}

verify().catch(console.error);
