import fs from 'fs-extra';
/*
 * Validator ensures agents are strictly following the protocol.
 * If they produce malformed reports, Relay rejects them immediately.
 */

export class Validator {

    /**
     * Validates the Engineer's report.
     * Expects:
     * # STATUS (COMPLETED | FAILED | BLOCKED)
     * ## CHANGES
     * ## VERIFICATION
     */
    async validateEngineerReport(filePath: string): Promise<string> {
        if (!await fs.pathExists(filePath)) {
            throw new Error(`Report file not found at ${filePath}. You must write the report before submitting.`);
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // 1. Strict Status Check
        const statusMatch = content.match(/# STATUS\s*\n.*(COMPLETED|FAILED|BLOCKED)/i);
        if (!statusMatch) {
            throw new Error(`Report is malformed. Missing '# STATUS' section with valid value (COMPLETED|FAILED|BLOCKED).`);
        }

        // 2. Changes Check
        if (!content.includes('## CHANGES')) {
            throw new Error(`Report is malformed. Missing '## CHANGES' section.`);
        }

        // 3. Verification Check
        if (!content.includes('## VERIFICATION')) {
            throw new Error(`Report is malformed. Missing '## VERIFICATION' section.`);
        }

        // 4. Content sanity check (not just headers)
        if (content.length < 50) {
            throw new Error(`Report is curiously short (${content.length} chars). Did you actually write anything?`);
        }

        return content;
    }

    /**
     * Validates the Architect's directive/feedback.
     * Expects:
     * # DIRECTIVE
     * Target: ...
     * ## EXECUTE (or ## CRITIQUE)
     * # VERDICT (APPROVE | REJECT)
     */
    async validateArchitectDirective(filePath: string): Promise<string> {
        if (!await fs.pathExists(filePath)) {
            throw new Error(`Directive file not found at ${filePath}. You must write the directive before submitting.`);
        }

        const content = await fs.readFile(filePath, 'utf-8');

        // 1. Header Check
        if (!content.match(/# DIRECTIVE/i)) {
            throw new Error(`Directive is malformed. Missing '# DIRECTIVE' header.`);
        }

        // 2. Body Check (Execute OR Critique)
        const hasExecute = content.match(/## EXECUTE/i);
        const hasCritique = content.match(/## CRITIQUE/i);

        if (!hasExecute && !hasCritique) {
            throw new Error(`Directive is malformed. Must contain either '## EXECUTE' or '## CRITIQUE' section.`);
        }

        // 3. Verdict Check
        const verdictMatch = content.match(/# VERDICT\s*\n.*(APPROVE|REJECT)/i);
        if (!verdictMatch) {
            throw new Error(`Directive is malformed. Missing '# VERDICT' section with valid value (APPROVE|REJECT).`);
        }

        return content;
    }
}
