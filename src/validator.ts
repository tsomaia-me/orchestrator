/**
 * Pure validation functions for directive and report content.
 */

export function validateReport(content: string): { valid: boolean; error?: string } {
  if (!content || content.length < 50) {
    return { valid: false, error: 'Report is too short or empty.' };
  }
  if (!content.match(/# STATUS\s*\n.*(COMPLETED|FAILED|BLOCKED)/i)) {
    return { valid: false, error: "Missing '# STATUS' section with (COMPLETED|FAILED|BLOCKED)." };
  }
  if (!content.includes('## CHANGES')) {
    return { valid: false, error: "Missing '## CHANGES' section." };
  }
  if (!content.includes('## VERIFICATION')) {
    return { valid: false, error: "Missing '## VERIFICATION' section." };
  }
  const verificationContent = content.split('## VERIFICATION')[1].split('##')[0].trim();
  if (verificationContent.length < 10 || verificationContent.includes('TODO')) {
    return {
      valid: false,
      error: "Verification section is too short or contains 'TODO'. Verify your work!",
    };
  }
  if (content.includes('[COMPLETED | FAILED | BLOCKED]')) {
    return { valid: false, error: 'Report contains placeholder. Select a status.' };
  }
  return { valid: true };
}

export function validateDirective(content: string): { valid: boolean; error?: string } {
  if (!content || !content.match(/# DIRECTIVE/i)) {
    return { valid: false, error: "Missing '# DIRECTIVE' header." };
  }
  const hasExecute = content.match(/## EXECUTE/i);
  const hasCritique = content.match(/## CRITIQUE/i);
  if (!hasExecute && !hasCritique) {
    return { valid: false, error: "Must contain '## EXECUTE' or '## CRITIQUE' section." };
  }
  if (!content.match(/#+\s*VERDICT\s*\n.*(APPROVE|REJECT)/i)) {
    return { valid: false, error: "Missing VERDICT section with (APPROVE|REJECT)." };
  }
  if (content.includes('[APPROVE | REJECT]')) {
    return { valid: false, error: 'Directive contains placeholder. Select APPROVE or REJECT.' };
  }
  return { valid: true };
}
