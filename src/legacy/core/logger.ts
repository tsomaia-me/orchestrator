export interface RelayLogger {
    info(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    success(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
}

export class ConsoleLogger implements RelayLogger {
    info(msg: string, ...args: any[]): void {
        console.log(msg, ...args);
    }

    error(msg: string, ...args: any[]): void {
        console.error(msg, ...args);
    }

    success(msg: string, ...args: any[]): void {
        console.log(msg, ...args);
    }

    warn(msg: string, ...args: any[]): void {
        console.warn(msg, ...args);
    }
}
