import { RelayContext } from './context';

export type TransitionHandler = (ctx: RelayContext) => Promise<void>;

/**
 * The Registry maps { Persona -> { State -> Handler } }
 */
export class TransitionRegistry {
    private handlers: Map<string, TransitionHandler> = new Map();

    register(persona: string, action: string, handler: TransitionHandler) {
        const key = `${persona}:${action}`;
        this.handlers.set(key, handler);
    }

    get(persona: string, action: string): TransitionHandler | undefined {
        return this.handlers.get(`${persona}:${action}`);
    }
}

export const registry = new TransitionRegistry();
