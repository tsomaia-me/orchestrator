import { RelayLogger } from './logger';
import { RelayAgent } from './agent';
import { RelayState } from './state';
import { FeatureState, TaskFile } from './feature';

export interface RelayContext {
    id: string; // Session ID
    persona: string;
    memory: RelayState;

    // Services
    logger: RelayLogger;
    agent: RelayAgent;

    // Arguments passed to the CLI
    args: Record<string, any>;

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
}

