/**
 * CORE: Prompt Context
 * Strict ViewModel for Nunjucks templates.
 */

import { RelayState, ExchangeEntry } from '../state';

export interface ToolDefinition {
    name: string;
    description: string;
    schema: string; // stringified JSON schema
}

export interface PromptContext {
    /** 1. Identity & State */
    role: 'architect' | 'engineer';
    state: RelayState;

    /** 2. Active Task */
    task?: {
        id: string;
        title: string;
        path: string;
        content: string;
    };

    /** 3. History */
    exchange?: {
        last?: ExchangeEntry;
        history: ExchangeEntry[];
    };

    /** 4. Project Environment */
    project: {
        root: string;
        rules?: string; // Content of .relay/rules.md
        config?: any; // Content of .relay/config.json
    };

    /** 5. Environment */
    env: {
        cwd: string;
        version: string;
        tools: ToolDefinition[];
        model?: string;
    };

    /** 6. User Injections (Sandboxed) */
    custom?: Record<string, string>;
}
