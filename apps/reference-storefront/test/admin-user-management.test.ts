/**
 * admin-auth-04: proves the two-layer owner-only gate on
 * /demo/[demoSlug]/admin/settings/users -- a page-level render check
 * (app/demo/[demoSlug]/admin/settings/users/page.tsx) AND a
 * server-action-level check (updateAdminUserRoleAction, lib/actions.ts), each
 * independently refusing a non-owner session -- using an injectable mock
 * AdminAuthAdapter (never a live Clerk account or the dev-default adapter's
 * cookie machinery), same pattern as admin-mutation-guard.test.ts.
 *
 * The page is an async Server Component -- calling it directly returns a
 * plain React element tree (no DOM renderer needed), which the walk*()
 * helpers below flatten/search, so structure can be asserted on without
 * pulling in a rendering library this app doesn't otherwise depend on.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentSession: AdminSession | null = null;
let users: { userId: string; email: string; role: AdminRole }[] = [];
const setAdminUserRole = vi.fn(async () => {});

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return users;
  },
  setAdminUserRole,
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ adminAuth: mockAdminAuth })),
}));

const { updateAdminUserRoleAction } = await import("../lib/actions.js");
const { default: AdminUsersPage } = await import("../app/demo/[demoSlug]/admin/settings/users/page.js");

const testParams = Promise.resolve({ demoSlug: "dragon-merch" });

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

/** Flattens a React element tree (as returned by directly calling a Server Component) to its rendered text content, without a DOM renderer. */
function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join("");
  if (typeof node === "object" && "props" in node) {
    return renderedText((node as { props: { children?: ReactNode } }).props?.children);
  }
  return "";
}

/** True if a React element of the given host type (e.g. "table") appears anywhere in the tree. */
function containsElementType(node: ReactNode, type: string): boolean {
  if (node === null || node === undefined || typeof node === "boolean") return false;
  if (Array.isArray(node)) return node.some((child) => containsElementType(child, type));
  if (typeof node === "object" && "type" in node) {
    const el = node as { type: unknown; props: { children?: ReactNode } };
    if (el.type === type) return true;
    return containsElementType(el.props?.children, type);
  }
  return false;
}

describe("AdminUsersPage (admin-auth-04, page-level owner-only gate)", () => {
  it("renders 'Owner access required' with no table for a non-owner (admin) session", async () => {
    currentSession = sessionFor("admin");
    users = [{ userId: "u1", email: "u1@example.com", role: "admin" }];

    const element = await AdminUsersPage({ params: testParams });

    expect(renderedText(element)).toMatch(/owner access required/i);
    expect(containsElementType(element, "table")).toBe(false);
  });

  it("renders 'Owner access required' with no table when there is no session at all", async () => {
    currentSession = null;
    users = [];

    const element = await AdminUsersPage({ params: testParams });

    expect(renderedText(element)).toMatch(/owner access required/i);
    expect(containsElementType(element, "table")).toBe(false);
  });

  it("renders the user table for an owner session", async () => {
    currentSession = sessionFor("owner");
    users = [
      { userId: "u1", email: "u1@example.com", role: "admin" },
      { userId: "u2", email: "u2@example.com", role: "viewer" },
    ];

    const element = await AdminUsersPage({ params: testParams });

    expect(containsElementType(element, "table")).toBe(true);
    const text = renderedText(element);
    expect(text).not.toMatch(/owner access required/i);
    expect(text).toContain("u1");
    expect(text).toContain("u1@example.com");
    expect(text).toContain("u2");
  });
});

describe("updateAdminUserRoleAction (admin-auth-04, server-action-level owner-only gate)", () => {
  it("rejects a non-owner (admin) session, even though the mock page-level check above is bypassed entirely here", async () => {
    currentSession = sessionFor("admin");
    setAdminUserRole.mockClear();

    const formData = new FormData();
    formData.set("demoSlug", "dragon-merch");
    formData.set("userId", "u1");
    formData.set("role", "owner");

    await expect(updateAdminUserRoleAction(formData)).rejects.toThrow(/not authorized/i);
    expect(setAdminUserRole).not.toHaveBeenCalled();
  });

  it("rejects a viewer session", async () => {
    currentSession = sessionFor("viewer");
    setAdminUserRole.mockClear();

    const formData = new FormData();
    formData.set("demoSlug", "dragon-merch");
    formData.set("userId", "u1");
    formData.set("role", "admin");

    await expect(updateAdminUserRoleAction(formData)).rejects.toThrow(/not authorized/i);
    expect(setAdminUserRole).not.toHaveBeenCalled();
  });

  it("rejects when there is no session at all", async () => {
    currentSession = null;
    setAdminUserRole.mockClear();

    const formData = new FormData();
    formData.set("demoSlug", "dragon-merch");
    formData.set("userId", "u1");
    formData.set("role", "admin");

    await expect(updateAdminUserRoleAction(formData)).rejects.toThrow(/not authorized/i);
    expect(setAdminUserRole).not.toHaveBeenCalled();
  });

  it("succeeds for an owner session, calling setAdminUserRole with exactly the submitted userId and role", async () => {
    currentSession = sessionFor("owner");
    setAdminUserRole.mockClear();

    const formData = new FormData();
    formData.set("demoSlug", "dragon-merch");
    formData.set("userId", "u2");
    formData.set("role", "admin");

    await updateAdminUserRoleAction(formData);

    expect(setAdminUserRole).toHaveBeenCalledTimes(1);
    expect(setAdminUserRole).toHaveBeenCalledWith("u2", "admin");
  });

  it("rejects an invalid role value even for an owner session", async () => {
    currentSession = sessionFor("owner");
    setAdminUserRole.mockClear();

    const formData = new FormData();
    formData.set("demoSlug", "dragon-merch");
    formData.set("userId", "u2");
    formData.set("role", "superadmin");

    await expect(updateAdminUserRoleAction(formData)).rejects.toThrow(/invalid role/i);
    expect(setAdminUserRole).not.toHaveBeenCalled();
  });
});
