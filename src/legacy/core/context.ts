import { RelayLogger } from './logger';
import { RelayAgent } from './agent';
import { RelayState } from './state';
import { FeatureState, TaskFile } from './feature';
import { LockManager } from './lock';

export interface RelayContext {
    id: string; // Session ID
    persona: string;
    memory: RelayState;

    // Services
    logger: RelayLogger;
    agent: RelayAgent;

    // Arguments passed to the CLI
    args: {
        feature: string;
        submit?: boolean;
        [key: string]: any;
    };

    // File paths for coordination
    paths: {
        workDir: string;
        reportFile?: string;
        directiveFile?: string;
    };

    // Task context (unified with Feature definitions)
    currentTask?: TaskFile;
    plan?: string;

    // Feature context
    featureState?: FeatureState;
    lock?: LockManager;
}

