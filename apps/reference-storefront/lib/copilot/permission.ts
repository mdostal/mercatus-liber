/**
 * scc-06's apply_option write path must be gated by the SAME
 * confirm:true-then-requireAdminPermission("mutate") discipline every other
 * admin mutation in this repo already follows -- no new trust boundary
 * invented (design-discussion.md #2e). lib/actions.ts's own
 * requireAdminPermission (a private, unexported function -- see
 * apps/reference-storefront/lib/actions.ts) is owned by the concurrent
 * scc-04 story this batch and must not be touched or imported from here.
 * This module instead calls the exact same underlying, unmodified
 * @mercatus-liber/admin-auth hasPermission(role, action) check directly --
 * same logic, same error message shape, a second call site rather than a
 * second mechanism.
 */
import { hasPermission } from "@mercatus-liber/admin-auth";
import type { AdminSession } from "@mercatus-liber/admin-auth";

export class CopilotNotAuthorizedError extends Error {
  constructor(action: string) {
    super(`Not authorized: this action requires "${action}" permission.`);
    this.name = "CopilotNotAuthorizedError";
  }
}

/** Throws CopilotNotAuthorizedError when there is no session or the session's role lacks "mutate". */
export function requireMutatePermission(session: AdminSession | null): void {
  if (!session || !hasPermission(session.role, "mutate")) {
    throw new CopilotNotAuthorizedError("mutate");
  }
}
