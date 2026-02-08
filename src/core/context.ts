import { RelayLogger } from './logger';
import { RelayAgent } from './agent';

export interface RelayContext {
    id: string; // Session ID
    persona: string;
    memory: any; // Typed as any for now, will correspond to State

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
}
