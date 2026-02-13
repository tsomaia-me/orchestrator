/**
 * SHELL: Bootstrap CLI
 * Scaffolding and maintenance tools.
 * Usage: relay init
 */

import fs from 'fs-extra';
import path from 'path';

export async function bootstrap(rootDir: string = process.cwd()) {
    const relayDir = path.join(rootDir, '.relay');
    await fs.ensureDir(relayDir);

    // 1. Create subdirectories
    await fs.ensureDir(path.join(relayDir, 'prompts'));
    await fs.ensureDir(path.join(relayDir, 'tasks'));
    await fs.ensureDir(path.join(relayDir, 'exchanges'));

    // 2. Copy Default Templates
    // In dev: templates/prompts -> .relay/prompts
    // In prod: dist/templates/prompts -> .relay/prompts
    const templateSrc = path.resolve(__dirname, '../../templates/prompts');
    const promptDest = path.join(relayDir, 'prompts');

    if (await fs.pathExists(templateSrc)) {
        await fs.copy(templateSrc, promptDest, { overwrite: false }); // Don't overwrite user mods
        console.log('✅ Initialized .relay/prompts with default templates.');
    } else {
        console.warn('⚠️ Could not find default templates at:', templateSrc);
    }

    // 3. Create Default Config
    const configPath = path.join(relayDir, 'config.json');
    if (!(await fs.pathExists(configPath))) {
        await fs.writeJson(configPath, {
            "$schema": "./relay.schema.json",
            "inject": {},
            "constants": {}
        }, { spaces: 2 });
        console.log('✅ Created .relay/config.json');
    }

    // 4. Create Rules
    const rulesPath = path.join(relayDir, 'rules.md');
    if (!(await fs.pathExists(rulesPath))) {
        await fs.writeFile(rulesPath, '# Project Rules\n\nAdd your custom project rules here.', 'utf-8');
        console.log('✅ Created .relay/rules.md');
    }

    console.log('🚀 Relay initialized successfully!');
}

// Simple CLI runner if executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('init')) {
        bootstrap().catch(console.error);
    } else {
        console.log('Usage: relay init');
    }
}
