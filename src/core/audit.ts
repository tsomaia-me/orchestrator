import fs from 'fs-extra';
import path from 'path';

export class AuditLogger {
    private auditPath: string;

    constructor(workDir: string) {
        this.auditPath = path.join(workDir, '.relay', 'audit.jsonl');
    }

    async log(event: string, payload: any): Promise<void> {
        await fs.ensureDir(path.dirname(this.auditPath));
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            payload
        };
        await fs.appendFile(this.auditPath, JSON.stringify(entry) + '\n');
    }
}
