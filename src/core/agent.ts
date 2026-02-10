import { RelayLogger } from './logger';
import { RelayContext } from './context';

export interface RelayAgent {
    tell(message: string): void;
}

export class ConsoleRelayAgent implements RelayAgent {
    constructor(private logger: RelayLogger, private persona: string) { }

    tell(message: string): void {
        const footer = `
--------------------------------------------------------------------------------
COMMAND: When finished, run \`relay ${this.persona} <feature> pulse --submit\`
WARNING: Do NOT run in background. Do NOT poll. Run ONCE, read, act, then run again.
--------------------------------------------------------------------------------
`;
        // We print the message cleanly, then the footer.
        this.logger.info(message);
        this.logger.info(footer);
    }
}
