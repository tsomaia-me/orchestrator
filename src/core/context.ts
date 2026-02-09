import { RelayLogger } from './logger';
import { RelayAgent } from './agent';
import { RelayState } from './state';
import { RelayConfig, TaskFile } from './config';

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
        reportFile: string;
        directiveFile: string;
    };

    // Config and task context (for auto-mode)
    config?: RelayConfig;
    currentTask?: TaskFile;
    plan?: string;
}

