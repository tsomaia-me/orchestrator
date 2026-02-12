import { RelayContext } from './context';

export type StepResult = 'CONTINUE' | 'WAIT' | 'STOP';

export type RelayStep = (ctx: RelayContext) => Promise<StepResult>;

export const step = (name: string, impl: RelayStep): RelayStep => {
    Object.defineProperty(impl, 'name', { value: name });
    return impl;
};
