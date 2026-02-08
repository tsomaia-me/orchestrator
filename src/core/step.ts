import { RelayContext } from './context';

export type RelayStep = (ctx: RelayContext) => Promise<void>;
