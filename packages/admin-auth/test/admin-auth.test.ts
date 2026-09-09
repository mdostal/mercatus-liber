import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_DEV_SESSION_COOKIE,
  createDefaultAdminAuthAdapter,
  hasPermission,
  verifyDevPassword,
} from "../src/index.js";
import type { AdminAction, AdminRole } from "../src/index.js";

const ACTIONS: AdminAction[] = ["view", "mutate", "manage_users"];

describe("hasPermission", () => {
  it("owner: all three actions return true", () => {
    for (const action of ACTIONS) {
      expect(hasPermission("owner", action)).toBe(true);
    }
  });

  it("admin: view and mutate return true, manage_users returns false", () => {
    expect(hasPermission("admin", "view")).toBe(true);
    expect(hasPermission("admin", "mutate")).toBe(true);
    expect(hasPermission("admin", "manage_users")).toBe(false);
  });

  it("viewer: view returns true, mutate and manage_users return false", () => {
    expect(hasPermission("viewer", "view")).toBe(true);
    expect(hasPermission("viewer", "mutate")).toBe(false);
    expect(hasPermission("viewer", "manage_users")).toBe(false);
  });

  // Full 3x3 matrix, not just the acceptance-criteria subset above.
  it("covers all 9 role/action combinations exactly", () => {
    const expected: Record<AdminRole, Record<AdminAction, boolean>> = {
      owner: { view: true, mutate: true, manage_users: true },
      admin: { view: true, mutate: true, manage_users: false },
      viewer: { view: true, mutate: false, manage_users: false },
    };
    for (const role of Object.keys(expected) as AdminRole[]) {
      for (const action of ACTIONS) {
        expect(hasPermission(role, action)).toBe(expected[role][action]);
      }
    }
  });
});

describe("verifyDevPassword", () => {
  const ORIGINAL_ENV = process.env.ADMIN_DEV_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_DEV_PASSWORD = "correct-horse-battery-staple";
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_DEV_PASSWORD;
    } else {
      process.env.ADMIN_DEV_PASSWORD = ORIGINAL_ENV;
    }
  });

  it("returns true for a matching value", () => {
    expect(verifyDevPassword("correct-horse-battery-staple")).toBe(true);
  });

  it("returns false for a non-matching value", () => {
    expect(verifyDevPassword("wrong-password")).toBe(false);
  });

  it("returns false when ADMIN_DEV_PASSWORD is unset, even for an empty-string guess", () => {
    delete process.env.ADMIN_DEV_PASSWORD;
    expect(verifyDevPassword("")).toBe(false);
    expect(verifyDevPassword("correct-horse-battery-staple")).toBe(false);
  });
});

describe("createDefaultAdminAuthAdapter", () => {
  const ORIGINAL_ENV = process.env.ADMIN_DEV_PASSWORD;

  beforeEach(() => {
    process.env.ADMIN_DEV_PASSWORD = "dev-secret";
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_DEV_PASSWORD;
    } else {
      process.env.ADMIN_DEV_PASSWORD = ORIGINAL_ENV;
    }
  });

  it("getCurrentSession() returns null when no session cookie is present", async () => {
    const adapter = createDefaultAdminAuthAdapter();
    await expect(adapter.getCurrentSession()).resolves.toBeNull();
  });

  it("getCurrentSession() returns null when getSessionCookie explicitly reports no cookie", async () => {
    const adapter = createDefaultAdminAuthAdapter({ getSessionCookie: () => undefined });
    await expect(adapter.getCurrentSession()).resolves.toBeNull();
  });

  it("getCurrentSession() returns a role 'owner' session when a valid dev-session cookie is present", async () => {
    const adapter = createDefaultAdminAuthAdapter({ getSessionCookie: () => "dev-secret" });
    const session = await adapter.getCurrentSession();
    expect(session).not.toBeNull();
    expect(session?.role).toBe("owner");
    expect(session?.userId).toBeTruthy();
    expect(session?.email).toBeTruthy();
  });

  it("getCurrentSession() returns null when the cookie is present but does not match the dev password", async () => {
    const adapter = createDefaultAdminAuthAdapter({ getSessionCookie: () => "not-the-password" });
    await expect(adapter.getCurrentSession()).resolves.toBeNull();
  });

  it("exposes the session cookie name as a constant", () => {
    expect(ADMIN_DEV_SESSION_COOKIE).toBe("ml_admin_dev_session");
  });

  it("listAdminUsers() returns a single synthetic dev-owner entry", async () => {
    const adapter = createDefaultAdminAuthAdapter();
    const users = await adapter.listAdminUsers();
    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe("owner");
  });

  it("setAdminUserRole() throws 'not supported in dev mode'", async () => {
    const adapter = createDefaultAdminAuthAdapter();
    await expect(adapter.setAdminUserRole("some-user", "admin")).rejects.toThrow(
      "not supported in dev mode",
    );
  });
});
