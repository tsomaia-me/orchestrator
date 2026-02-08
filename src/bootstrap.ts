import { createRelay, loop } from './core/runner';
import { systemPrompt, awaitFile, writeDirective, lookupTask } from './steps/standard';

export const architectRelay = createRelay({
    name: 'architect',
    steps: [
        systemPrompt('architect'),
        loop([
            lookupTask(),
            awaitFile('reportFile'), // Wait for Engineer Report
            // reviewReport(), // Logic to read/diff
            writeDirective(), // Prompt Architect to write back
            // awaitFile('directiveFile') // Wait for Architect to actually write it?
        ])
    ]
});

export const engineerRelay = createRelay({
    name: 'engineer',
    steps: [
        systemPrompt('engineer'),
        loop([
            awaitFile('directiveFile'), // Wait for Architect Directive
            // executeTask(),
            // writeReport()
        ])
    ]
});
