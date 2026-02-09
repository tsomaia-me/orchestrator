/**
 * Relay Bootstrap Configuration
 * 
 * This file defines the behavior of the Architect and Engineer agents.
 * 
 * To customize:
 * 1. Ensure @tsomaia/relay is installed: npm install -D @tsomaia/relay
 * 2. Modify the pipelines below
 */

import { createRelay, loop } from '@tsomaia/relay/dist/core/runner.js';
import {
    systemPrompt,
    lookupTask,
    awaitFile,
    readDirective,
    readReport,
    archiveFile,
    promptWrite
} from '@tsomaia/relay/dist/steps/standard.js';

/**
 * Architect Pipeline
 */
export const architect = createRelay({
    name: 'architect',
    steps: [
        systemPrompt('architect'),
        loop([
            lookupTask(),
            awaitFile('reportFile'),
            readReport(),
            archiveFile('reportFile'),
            promptWrite('directiveFile')
        ])
    ]
});

/**
 * Engineer Pipeline
 */
export const engineer = createRelay({
    name: 'engineer',
    steps: [
        systemPrompt('engineer'),
        loop([
            lookupTask(),
            awaitFile('directiveFile'),
            readDirective(),
            archiveFile('directiveFile'),
            promptWrite('reportFile')
        ])
    ]
});
