import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClerkAdminBackendUsers, ClerkAdminUserLike } from "../src/index.js";
import { createClerkAdminAuthAdapter } from "../src/index.js";

/**
 * Every test in this file wires createClerkAdminAuthAdapter with an injected
 * mock -- no real @clerk/nextjs/server call (`auth`, `currentUser`,
 * `clerkClient`) is ever exercised here. There are no live Clerk credentials
 * in this environment; a real network call would simply fail, but more
 * importantly this suite's job is to prove the adapter's own role-mapping
 * and fail-closed logic, not Clerk's API itself. See README.md.
 */

function fakeUser(overrides: Partial<ClerkAdminUserLike> & { id: string }): ClerkAdminUserLike {
  return {
    primaryEmailAddress: { emailAddress: `${overrides.id}@example.com` },
    publicMetadata: {},
    ...overrides,
  };
}

describe("createClerkAdminAuthAdapter", () => {
  describe("getCurrentSession", () => {
    it("returns null when the mock reports no authenticated user (auth() has no userId)", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: null })),
        currentUser: vi.fn(async () => {
          throw new Error("must not be called when auth() reports no userId");
        }),
      });

      expect(await adapter.getCurrentSession()).toBeNull();
    });

    it("returns null when auth() reports a userId but currentUser() resolves nothing", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_1" })),
        currentUser: vi.fn(async () => null),
      });

      expect(await adapter.getCurrentSession()).toBeNull();
    });

    it("returns the exact role from publicMetadata.role when it is a valid role", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_admin" })),
        currentUser: vi.fn(async () =>
          fakeUser({ id: "user_admin", publicMetadata: { role: "admin" }, primaryEmailAddress: { emailAddress: "admin@example.com" } }),
        ),
      });

      expect(await adapter.getCurrentSession()).toEqual({
        userId: "user_admin",
        email: "admin@example.com",
        role: "admin",
      });
    });

    it("returns the exact role for 'owner' too, not just 'admin'", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_owner" })),
        currentUser: vi.fn(async () => fakeUser({ id: "user_owner", publicMetadata: { role: "owner" } })),
      });

      expect((await adapter.getCurrentSession())?.role).toBe("owner");
    });

    it("defaults to 'viewer' when publicMetadata.role is missing (fails closed, never a more-privileged default)", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_no_role" })),
        currentUser: vi.fn(async () => fakeUser({ id: "user_no_role", publicMetadata: {} })),
      });

      expect((await adapter.getCurrentSession())?.role).toBe("viewer");
    });

    it("defaults to 'viewer' when publicMetadata.role holds an invalid value (fails closed)", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_bad_role" })),
        currentUser: vi.fn(async () => fakeUser({ id: "user_bad_role", publicMetadata: { role: "superadmin" } })),
      });

      expect((await adapter.getCurrentSession())?.role).toBe("viewer");
    });

    it("defaults to 'viewer' when publicMetadata itself is absent", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_no_metadata" })),
        currentUser: vi.fn(async () => fakeUser({ id: "user_no_metadata", publicMetadata: undefined })),
      });

      expect((await adapter.getCurrentSession())?.role).toBe("viewer");
    });

    it("falls back to emailAddresses[0] when primaryEmailAddress is absent", async () => {
      const adapter = createClerkAdminAuthAdapter({
        auth: vi.fn(async () => ({ userId: "user_fallback_email" })),
        currentUser: vi.fn(async () =>
          fakeUser({
            id: "user_fallback_email",
            primaryEmailAddress: null,
            emailAddresses: [{ emailAddress: "fallback@example.com" }],
            publicMetadata: { role: "viewer" },
          }),
        ),
      });

      expect((await adapter.getCurrentSession())?.email).toBe("fallback@example.com");
    });
  });

  describe("listAdminUsers", () => {
    it("lists multiple users, correctly mapping valid, missing, and invalid role metadata", async () => {
      const users: ClerkAdminBackendUsers = {
        getUserList: vi.fn(async () => ({
          data: [
            fakeUser({ id: "user_owner", publicMetadata: { role: "owner" } }),
            fakeUser({ id: "user_missing_role", publicMetadata: {} }),
            fakeUser({ id: "user_invalid_role", publicMetadata: { role: "not-a-role" } }),
          ],
        })),
        updateUserMetadata: vi.fn(async () => {
          throw new Error("not exercised in this test");
        }),
      };
      const adapter = createClerkAdminAuthAdapter({ users: vi.fn(async () => users) });

      const result = await adapter.listAdminUsers();

      expect(result).toEqual([
        { userId: "user_owner", email: "user_owner@example.com", role: "owner" },
        { userId: "user_missing_role", email: "user_missing_role@example.com", role: "viewer" },
        { userId: "user_invalid_role", email: "user_invalid_role@example.com", role: "viewer" },
      ]);
    });

    it("returns an empty list when the mock user-list call returns no users", async () => {
      const users: ClerkAdminBackendUsers = {
        getUserList: vi.fn(async () => ({ data: [] })),
        updateUserMetadata: vi.fn(async () => {
          throw new Error("not exercised in this test");
        }),
      };
      const adapter = createClerkAdminAuthAdapter({ users: vi.fn(async () => users) });

      expect(await adapter.listAdminUsers()).toEqual([]);
    });
  });

  describe("setAdminUserRole", () => {
    let updateUserMetadata: ReturnType<typeof vi.fn>;
    let adapter: ReturnType<typeof createClerkAdminAuthAdapter>;

    beforeEach(() => {
      updateUserMetadata = vi.fn(async (userId: string, params: { publicMetadata: Record<string, unknown> }) =>
        fakeUser({ id: userId, publicMetadata: params.publicMetadata }),
      );
      const users: ClerkAdminBackendUsers = {
        getUserList: vi.fn(async () => {
          throw new Error("not exercised in this test");
        }),
        updateUserMetadata,
      };
      adapter = createClerkAdminAuthAdapter({ users: vi.fn(async () => users) });
    });

    it("invokes the mock's update-metadata call with exactly the given userId and role", async () => {
      await adapter.setAdminUserRole("user_42", "admin");

      expect(updateUserMetadata).toHaveBeenCalledTimes(1);
      expect(updateUserMetadata).toHaveBeenCalledWith("user_42", { publicMetadata: { role: "admin" } });
    });

    it("works for every valid role (owner/admin/viewer), not just 'admin'", async () => {
      await adapter.setAdminUserRole("user_1", "owner");
      await adapter.setAdminUserRole("user_2", "viewer");

      expect(updateUserMetadata).toHaveBeenNthCalledWith(1, "user_1", { publicMetadata: { role: "owner" } });
      expect(updateUserMetadata).toHaveBeenNthCalledWith(2, "user_2", { publicMetadata: { role: "viewer" } });
    });
  });
});
