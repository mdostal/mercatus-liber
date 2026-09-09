import type { AdminRole } from "./types.js";

/** The three things a caller ever asks permission for -- a flat, three-role model, deliberately not fine-grained per-object permissions. */
export type AdminAction = "view" | "mutate" | "manage_users";

/**
 * Pure permission check, no I/O -- the full owner/admin/viewer x
 * view/mutate/manage_users matrix (9 combinations):
 *  - owner:  view=true,  mutate=true,  manage_users=true
 *  - admin:  view=true,  mutate=true,  manage_users=false
 *  - viewer: view=true,  mutate=false, manage_users=false
 */
export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  if (role === "owner") return true;
  if (role === "admin") return action === "view" || action === "mutate";
  return action === "view"; // viewer
}
