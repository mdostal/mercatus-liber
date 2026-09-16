/**
 * data-reset-and-safety epic: proves the two independent gates on
 * resetDemoDataAction (lib/actions.ts) -- owner-only permission (mirroring
 * admin-user-management.test.ts's own precedent for updateAdminUserRoleAction)
 * AND a real, case-sensitive typed-confirmation check -- using an injectable
 * mock AdminAuthAdapter and a mocked lib/reset-demo-data.js module (never a
 * live Postgres connection). Asserts the underlying resetDemoData is called
 * with exactly the submitted demoSlug, and NOT AT ALL when either gate
 * fails, so a caller-facing bug here can never silently perform (or skip
 * verifying) a real, destructive delete.
 */
import { describe, expect, it, vi } from "vitest";
import type { AdminAuthAdapter, AdminRole, AdminSession } from "@mercatus-liber/admin-auth";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let currentSession: AdminSession | null = null;

const mockAdminAuth: AdminAuthAdapter = {
  async getCurrentSession() {
    return currentSession;
  },
  async listAdminUsers() {
    return [];
  },
  async setAdminUserRole() {},
};

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ adminAuth: mockAdminAuth })),
}));

const resetDemoData = vi.fn(async (demoSlug: string) => ({
  demoSlug,
  mode: "shared-database-scoped-delete" as const,
  deletedCounts: {},
  skippedTables: [],
}));

vi.mock("../lib/reset-demo-data.js", () => ({
  resetDemoData: (demoSlug: string) => resetDemoData(demoSlug),
}));

const { resetDemoDataAction } = await import("../lib/actions.js");

function sessionFor(role: AdminRole): AdminSession {
  return { userId: `test-${role}`, email: `${role}@example.com`, role };
}

function formDataFor(demoSlug: string, confirmSlug: string): FormData {
  const formData = new FormData();
  formData.set("demoSlug", demoSlug);
  formData.set("confirmSlug", confirmSlug);
  return formData;
}

describe("resetDemoDataAction (data-reset-and-safety, owner-only + typed-confirmation gate)", () => {
  it("rejects a non-owner (admin) session before ever checking the typed confirmation, and performs no delete", async () => {
    currentSession = sessionFor("admin");
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "northline"))).rejects.toThrow(/not authorized/i);
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("rejects a viewer session, and performs no delete", async () => {
    currentSession = sessionFor("viewer");
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "northline"))).rejects.toThrow(/not authorized/i);
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("rejects when there is no session at all, and performs no delete", async () => {
    currentSession = null;
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "northline"))).rejects.toThrow(/not authorized/i);
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("rejects an owner session whose typed confirmation does not match this demo's slug, and performs no delete", async () => {
    currentSession = sessionFor("owner");
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "north-line"))).rejects.toThrow(
      /typed confirmation did not match/i,
    );
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("rejects a typed confirmation that only case-differs from the real slug (case-sensitive exact match required)", async () => {
    currentSession = sessionFor("owner");
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "Northline"))).rejects.toThrow(
      /typed confirmation did not match/i,
    );
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("rejects a typed confirmation matching a DIFFERENT real demo slug, and performs no delete", async () => {
    currentSession = sessionFor("owner");
    resetDemoData.mockClear();

    await expect(resetDemoDataAction(formDataFor("northline", "print-shop"))).rejects.toThrow(
      /typed confirmation did not match/i,
    );
    expect(resetDemoData).not.toHaveBeenCalled();
  });

  it("an owner session with the exact, correctly-typed slug triggers exactly one scoped reset for that demo, nothing broader", async () => {
    currentSession = sessionFor("owner");
    resetDemoData.mockClear();

    await resetDemoDataAction(formDataFor("northline", "northline"));

    expect(resetDemoData).toHaveBeenCalledTimes(1);
    expect(resetDemoData).toHaveBeenCalledWith("northline");
  });

  it("an owner session resetting print-shop never triggers a reset for any other demo slug", async () => {
    currentSession = sessionFor("owner");
    resetDemoData.mockClear();

    await resetDemoDataAction(formDataFor("print-shop", "print-shop"));

    expect(resetDemoData).toHaveBeenCalledTimes(1);
    expect(resetDemoData).toHaveBeenCalledWith("print-shop");
    expect(resetDemoData).not.toHaveBeenCalledWith("northline");
    expect(resetDemoData).not.toHaveBeenCalledWith("broadleaf");
  });
});
