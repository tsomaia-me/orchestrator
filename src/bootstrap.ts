/**
 * Default Bootstrap
 * 
 * Defines the architect and engineer pipelines using the step-based pattern.
 * This gets compiled to dist/bootstrap.js and copied to .relay/bootstrap.js
 * 
 * Users can customize the .relay/bootstrap.js to modify pipeline behavior.
 * 
 * Resolution order:
 * 1. .relay/features/<feature>/bootstrap.js (feature-level)
 * 2. .relay/bootstrap.js (relay-level)
 * 3. Default from relay package (this file, compiled)
 */

import { createRelay, loop } from './core/runner';
import {
    systemPrompt,
    lookupTask,
    awaitFile,
    readDirective,
    readReport,
    archiveFile,
    promptWrite
} from './steps/standard';

/**
 * Architect Pipeline
 * 
 * Flow:
 * 1. Load system prompt
 * 2. Loop:
 *    a. Check task status
 *    b. Wait for engineer report (if exists)
 *    c. Read and validate report
 *    d. Archive report
 *    e. Prompt architect to write directive
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
 * 
 * Flow:
 * 1. Load system prompt
 * 2. Loop:
 *    a. Check task status
 *    b. Wait for architect directive
 *    c. Read and validate directive
 *    d. Archive directive
 *    e. Prompt engineer to write report
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
