import type { AdminRole } from "./types.js";

/**
 * The four things a caller ever asks permission for -- a flat, three-role
 * model, deliberately not fine-grained per-object permissions.
 * "reset_demo_data" (data-reset-and-safety epic) is the second owner-only
 * action alongside "manage_users" -- a demo-wide destructive wipe-and-reseed
 * is at least as sensitive as changing another admin's role, so it gets the
 * same, strictest gate rather than "mutate"'s admin-or-owner bar.
 */
export type AdminAction = "view" | "mutate" | "manage_users" | "reset_demo_data";

/**
 * Pure permission check, no I/O -- the full owner/admin/viewer x
 * view/mutate/manage_users/reset_demo_data matrix (12 combinations):
 *  - owner:  view=true,  mutate=true,  manage_users=true,  reset_demo_data=true
 *  - admin:  view=true,  mutate=true,  manage_users=false, reset_demo_data=false
 *  - viewer: view=true,  mutate=false, manage_users=false, reset_demo_data=false
 */
export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  if (role === "owner") return true;
  if (role === "admin") return action === "view" || action === "mutate";
  return action === "view"; // viewer
}
