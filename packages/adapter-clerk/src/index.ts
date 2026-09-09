import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";

/** The three role strings this adapter will ever resolve to. Kept local (rather than re-deriving from AdminRole at runtime) so the fail-closed check below is a simple, obviously-correct string membership test. */
const VALID_ROLES: readonly AdminRole[] = ["owner", "admin", "viewer"];

/**
 * Reads whatever `publicMetadata.role` happens to hold -- untyped JSON set by
 * a dashboard operator, a prior write from this package, or nothing at all --
 * and resolves it to a known AdminRole. Anything that isn't exactly one of
 * the three valid role strings (missing, wrong type, typo'd value, etc.)
 * resolves to "viewer".
 *
 * Fail CLOSED: malformed or absent role metadata must never grant "admin" or
 * "owner" access. This is the single choke point every code path below goes
 * through, so there is exactly one place that decision is made.
 */
function toAdminRole(value: unknown): AdminRole {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value) ? (value as AdminRole) : "viewer";
}

/**
 * The subset of a real Clerk `User` (from `@clerk/backend`, re-exported by
 * `@clerk/nextjs/server`) this adapter actually reads. A real `User` is
 * structurally a superset of this and is used as-is by the default wiring
 * below; tests inject plain object literals shaped like this instead.
 */
export interface ClerkAdminUserLike {
  id: string;
  publicMetadata?: Record<string, unknown> | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: { emailAddress: string }[];
}

function resolveEmail(user: ClerkAdminUserLike): string {
  return user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? "";
}

function toSessionEntry(user: ClerkAdminUserLike): { userId: string; email: string; role: AdminRole } {
  return { userId: user.id, email: resolveEmail(user), role: toAdminRole(user.publicMetadata?.role) };
}

/**
 * The subset of the Clerk Backend SDK's `ClerkClient["users"]` resource this
 * adapter calls. A real `clerkClient()`'s `.users` is structurally a
 * superset of this; tests inject a plain object shaped like this instead.
 */
export interface ClerkAdminBackendUsers {
  getUserList(params?: { limit?: number; offset?: number }): Promise<{ data: ClerkAdminUserLike[] }>;
  updateUserMetadata(userId: string, params: { publicMetadata: Record<string, unknown> }): Promise<ClerkAdminUserLike>;
}

/**
 * The three real Clerk entry points this adapter wraps, each injectable at
 * construction time so tests can substitute a mock instead of exercising a
 * live Clerk account -- there are no live Clerk credentials in this
 * environment as of this piece of work (see README.md). Every field defaults
 * to the real `@clerk/nextjs/server` import when not provided, so
 * `createClerkAdminAuthAdapter()` with no arguments is the real, deployed
 * adapter.
 */
export interface ClerkAdminAuthAdapterDeps {
  /** Resolves the current request's authenticated Clerk userId, or null if signed out. Real default: `auth()` from `@clerk/nextjs/server`. */
  auth?: () => Promise<{ userId: string | null }>;
  /** Resolves the current request's full Clerk user record, or null. Real default: `currentUser()` from `@clerk/nextjs/server`. */
  currentUser?: () => Promise<ClerkAdminUserLike | null>;
  /** Resolves the Backend SDK's `users` resource. Real default: `(await clerkClient()).users` from `@clerk/nextjs/server`. */
  users?: () => Promise<ClerkAdminBackendUsers>;
}

/**
 * Real, deployed AdminAuthAdapter (subsystem 21) implementation, backed by
 * Clerk's Next.js SDK (`auth()`, `currentUser()`) for the current request's
 * session and Clerk's Backend SDK (`clerkClient().users`) for admin user
 * management. Role data is never owned by this package -- it lives entirely
 * in Clerk's own `publicMetadata.role`, so Clerk's own dashboard stays a
 * valid way to assign roles too, not just this repo's admin UI. See
 * .pHive/epics/admin-auth-clerk/docs/design-discussion.md section 3 and
 * README.md.
 *
 * `getCurrentSession()` takes no request argument, matching
 * `AdminAuthAdapter`'s contract -- both `auth()` and `currentUser()` read
 * ambient Next.js App Router request context themselves.
 */
export function createClerkAdminAuthAdapter(deps?: ClerkAdminAuthAdapterDeps): AdminAuthAdapter {
  const getAuth: NonNullable<ClerkAdminAuthAdapterDeps["auth"]> =
    deps?.auth ??
    (async () => {
      const result = await auth();
      return { userId: result.userId };
    });

  const getCurrentUser: NonNullable<ClerkAdminAuthAdapterDeps["currentUser"]> =
    deps?.currentUser ??
    (async () => {
      const user = await currentUser();
      return user;
    });

  const getUsers: NonNullable<ClerkAdminAuthAdapterDeps["users"]> =
    deps?.users ??
    (async () => {
      const client = await clerkClient();
      return client.users;
    });

  return {
    async getCurrentSession(): Promise<AdminSession | null> {
      const { userId } = await getAuth();
      if (!userId) return null;

      const user = await getCurrentUser();
      if (!user) return null;

      return toSessionEntry(user);
    },

    async listAdminUsers(): Promise<{ userId: string; email: string; role: AdminRole }[]> {
      const users = await getUsers();
      const { data } = await users.getUserList();
      return data.map(toSessionEntry);
    },

    async setAdminUserRole(userId: string, role: AdminRole): Promise<void> {
      const users = await getUsers();
      await users.updateUserMetadata(userId, { publicMetadata: { role } });
    },
  };
}
