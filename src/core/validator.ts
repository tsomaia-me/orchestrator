import fs from 'fs-extra';
/*
 * Validator ensures agents are strictly following the protocol.
 * If they produce malformed reports, Relay rejects them immediately.
 */

export class Validator {

    /**
     * Validates the Engineer's report.
     * Expects:
     * # STATUS
     * [COMPLETED | FAILED | BLOCKED]
     */
    async validateEngineerReport(filePath: string): Promise<string> {
        if (!await fs.pathExists(filePath)) {
            throw new Error(`Report file not found at ${filePath}. You must write the report before submitting.`);
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // Strict Regex Check
        const statusMatch = content.match(/# STATUS\s*\n\s*(COMPLETED|FAILED|BLOCKED)/i);
        if (!statusMatch) {
            throw new Error(`Report is malformed. Missing '# STATUS' section with valid value (COMPLETED|FAILED|BLOCKED). Content preview: ${content.substring(0, 50)}...`);
        }

        return content;
    }

    /**
     * Validates the Architect's directive/feedback.
     * Expects:
     * # VERDICT
     * [APPROVE | REJECT]
     */
    async validateArchitectDirective(filePath: string): Promise<string> {
        if (!await fs.pathExists(filePath)) {
            throw new Error(`Directive file not found at ${filePath}. You must write the directive before submitting.`);
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // Strict Regex Check
        const verdictMatch = content.match(/# VERDICT\s*\n\s*(APPROVE|REJECT)/i);
        if (!verdictMatch) {
            throw new Error(`Directive is malformed. Missing '# VERDICT' section with valid value (APPROVE|REJECT). Content preview: ${content.substring(0, 50)}...`);
        }

        return content;
    }
}
