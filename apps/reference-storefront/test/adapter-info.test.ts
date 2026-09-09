/**
 * set-01: covers every acceptance criterion in
 * .pHive/epics/admin-adapter-visibility-settings/stories/set-01-adapter-info-module.yaml
 * for lib/adapter-info.ts. Uses vi.stubEnv/vi.unstubAllEnvs so each test's
 * environment mutation can't leak into the next -- and, per the "not
 * cached/memoized" acceptance criterion, calls getAdapterInfo() again after
 * mutating env within a single test to prove it reflects the change.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdapterInfo } from "../lib/adapter-info.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAdapterInfo", () => {
  it("with no env vars set: persistence and CMS are active, payments is unconfigured, analytics is a no-op and active", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("POSTHOG_API_KEY", "");
    vi.stubEnv("SANITY_PROJECT_ID", "");

    const info = getAdapterInfo();
    expect(info).toHaveLength(4);

    const persistence = info.find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("SQLite (in-memory)");

    const cms = info.find((e) => e.subsystem === "CMS")!;
    expect(cms.adapter).toBe("In-memory (reference default)");
    expect(cms.status).toBe("active");

    const payments = info.find((e) => e.subsystem === "Payments")!;
    expect(payments.status).toBe("unconfigured");

    const analytics = info.find((e) => e.subsystem === "Analytics")!;
    expect(analytics.adapter).toBe("No-op (disabled)");
    expect(analytics.status).toBe("active");
  });

  it("reports Sanity as active when SANITY_PROJECT_ID is truthy", () => {
    vi.stubEnv("SANITY_PROJECT_ID", "proj123");

    const cms = getAdapterInfo().find((e) => e.subsystem === "CMS")!;
    expect(cms.adapter).toBe("Sanity");
    expect(cms.status).toBe("active");
  });

  it("reports a test-mode Stripe key as active with 'test' mentioned in the detail", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc123");

    const payments = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(payments.status).toBe("active");
    expect(payments.detail).toMatch(/test/i);
  });

  it("reports a live-mode Stripe key as active with 'live' mentioned in the detail", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc123");

    const payments = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(payments.status).toBe("active");
    expect(payments.detail).toMatch(/live/i);
  });

  it("reports an unrecognized Stripe key prefix honestly, without guessing a mode", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "some_other_format_key");

    const payments = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(payments.status).toBe("active");
    expect(payments.detail).not.toMatch(/test-mode|live-mode/i);
  });

  it("reports PostHog as active when POSTHOG_API_KEY is truthy", () => {
    vi.stubEnv("POSTHOG_API_KEY", "phc_abc123");

    const analytics = getAdapterInfo().find((e) => e.subsystem === "Analytics")!;
    expect(analytics.adapter).toBe("PostHog");
    expect(analytics.status).toBe("active");
  });

  it("is not cached/memoized -- two calls with different env values in between reflect the current environment each time", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const before = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(before.status).toBe("unconfigured");

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xyz");
    const after = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(after.status).toBe("active");
    expect(after.detail).toMatch(/test/i);
  });

  it("always returns exactly four entries with persistence and CMS never varying with env", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xyz");
    vi.stubEnv("POSTHOG_API_KEY", "phc_xyz");

    const info = getAdapterInfo();
    expect(info).toHaveLength(4);
    expect(info.map((e) => e.subsystem)).toEqual(["Persistence (catalog)", "CMS", "Payments", "Analytics"]);
    expect(info[0]!.status).toBe("active");
    expect(info[1]!.status).toBe("active");
  });
});
