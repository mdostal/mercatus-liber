/**
 * The "agent proposes, a human or policy approves" pattern for admin write
 * tools (docs/subsystems/14-ai-mcp-interface.md open question 1, resolved in
 * this epic's docs/ai-mcp-interface-decisions.md). Called without
 * `confirm: true`, an admin handler returns a preview instead of executing;
 * called with it, the handler proceeds.
 */
export interface ConfirmationPending {
  requiresConfirmation: true;
  preview: Record<string, unknown>;
}

export function needsConfirmation(input: Record<string, unknown>): boolean {
  return input.confirm !== true;
}

export function pendingConfirmation(preview: Record<string, unknown>): ConfirmationPending {
  return { requiresConfirmation: true, preview };
}
