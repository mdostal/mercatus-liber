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
  it("with no env vars set: persistence and CMS are active, payments is a real sandbox adapter (also active), analytics is a no-op and active, fulfillment is manual-only and active", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("POSTHOG_API_KEY", "");
    vi.stubEnv("SANITY_PROJECT_ID", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    vi.stubEnv("SQLITE_FILE_PATH", "");
    vi.stubEnv("PRINTFUL_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_SHOP_ID", "");
    vi.stubEnv("SHIPPO_API_TOKEN", "");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");

    const info = getAdapterInfo();
    expect(info).toHaveLength(8);

    const persistence = info.find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("SQLite (in-memory)");
    expect(persistence.detail).toMatch(/ephemeral/i);

    const cms = info.find((e) => e.subsystem === "CMS")!;
    expect(cms.adapter).toBe("In-memory (reference default)");
    expect(cms.status).toBe("active");

    // sandbox-checkout epic: STRIPE_SECRET_KEY unset no longer means
    // "broken" -- createSandboxPaymentAdapter() is a real, fully-working
    // PaymentAdapter (packages/payments/src/sandbox-adapter.ts), so this is
    // "active" the same as every other adapter row, just a different
    // concrete adapter than Stripe.
    const payments = info.find((e) => e.subsystem === "Payments")!;
    expect(payments.status).toBe("active");
    expect(payments.adapter).toBe("Sandbox (demo mode)");

    const analytics = info.find((e) => e.subsystem === "Analytics")!;
    expect(analytics.adapter).toBe("No-op (disabled)");
    expect(analytics.status).toBe("active");

    const fulfillment = info.find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual (self-fulfillment)");
    expect(fulfillment.status).toBe("active");

    const shipping = info.find((e) => e.subsystem === "Shipping")!;
    expect(shipping.adapter).toBe("Manual (PirateShip)");
    expect(shipping.status).toBe("active");

    const media = info.find((e) => e.subsystem === "Image CDN")!;
    expect(media.adapter).toBe("Passthrough (no transform)");
    expect(media.status).toBe("active");

    const inventory = info.find((e) => e.subsystem === "Inventory")!;
    expect(inventory.adapter).toBe("In-memory (reference default)");
    expect(inventory.status).toBe("active");
  });

  it("reports file-backed SQLite as active, naming the exact path, when SQLITE_FILE_PATH is truthy and DATABASE_URL is unset", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SQLITE_FILE_PATH", "/data/catalog.db");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("SQLite (file-backed)");
    expect(persistence.detail).toContain("/data/catalog.db");
    expect(persistence.detail).not.toMatch(/ephemeral/i);
  });

  it("reports MongoDB as active when MONGODB_URL is truthy and DATABASE_URL is unset", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("MongoDB");
  });

  it("DATABASE_URL wins over MONGODB_URL when both are set -- a deployment picks one real backend, not a race", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.adapter).toBe("Postgres");
  });

  it("reports Convex as active when CONVEX_URL is truthy and neither DATABASE_URL nor MONGODB_URL is set", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "");
    vi.stubEnv("CONVEX_URL", "https://my-deployment-123.convex.cloud");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("Convex");
  });

  it("MONGODB_URL wins over CONVEX_URL when both are set (and DATABASE_URL is not)", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/shop");
    vi.stubEnv("CONVEX_URL", "https://my-deployment-123.convex.cloud");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.adapter).toBe("MongoDB");
  });

  it("reports Postgres as active when DATABASE_URL is truthy, taking priority over SQLITE_FILE_PATH", () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");
    vi.stubEnv("SQLITE_FILE_PATH", "/data/should-not-be-used.db");

    const persistence = getAdapterInfo().find((e) => e.subsystem === "Persistence (catalog)")!;
    expect(persistence.status).toBe("active");
    expect(persistence.adapter).toBe("Postgres");
    expect(persistence.detail).not.toContain("should-not-be-used");
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

  it("reports Printful as registered alongside manual when PRINTFUL_API_TOKEN is truthy", () => {
    vi.stubEnv("PRINTFUL_API_TOKEN", "fake-test-token-for-wiring-verification-only");

    const fulfillment = getAdapterInfo().find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual + Printful (registered)");
    expect(fulfillment.status).toBe("active");
    expect(fulfillment.detail).toMatch(/printful/i);
  });

  it("reports manual-only fulfillment when PRINTFUL_API_TOKEN is unset", () => {
    vi.stubEnv("PRINTFUL_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_SHOP_ID", "");

    const fulfillment = getAdapterInfo().find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual (self-fulfillment)");
    expect(fulfillment.status).toBe("active");
  });

  it("reports Printify as registered alongside manual when both PRINTIFY_API_TOKEN and PRINTIFY_SHOP_ID are truthy", () => {
    vi.stubEnv("PRINTFUL_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_API_TOKEN", "fake-test-token-for-wiring-verification-only");
    vi.stubEnv("PRINTIFY_SHOP_ID", "12345");

    const fulfillment = getAdapterInfo().find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual + Printify (registered)");
    expect(fulfillment.status).toBe("active");
    expect(fulfillment.detail).toMatch(/printify/i);
  });

  it("does not register Printify when only one of PRINTIFY_API_TOKEN/PRINTIFY_SHOP_ID is set -- both are required", () => {
    vi.stubEnv("PRINTFUL_API_TOKEN", "");
    vi.stubEnv("PRINTIFY_API_TOKEN", "fake-test-token-for-wiring-verification-only");
    vi.stubEnv("PRINTIFY_SHOP_ID", "");

    const fulfillment = getAdapterInfo().find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual (self-fulfillment)");
  });

  it("registers Printful and Printify additively (both, not a swap) when all three env vars are truthy", () => {
    vi.stubEnv("PRINTFUL_API_TOKEN", "fake-test-token-for-wiring-verification-only");
    vi.stubEnv("PRINTIFY_API_TOKEN", "fake-test-token-for-wiring-verification-only");
    vi.stubEnv("PRINTIFY_SHOP_ID", "12345");

    const fulfillment = getAdapterInfo().find((e) => e.subsystem === "Fulfillment")!;
    expect(fulfillment.adapter).toBe("Manual + Printful + Printify (registered)");
    expect(fulfillment.status).toBe("active");
    expect(fulfillment.detail).toMatch(/printful/i);
    expect(fulfillment.detail).toMatch(/printify/i);
  });

  it("reports Shippo as registered alongside manual when SHIPPO_API_TOKEN is truthy", () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "fake-test-token-for-wiring-verification-only");

    const shipping = getAdapterInfo().find((e) => e.subsystem === "Shipping")!;
    expect(shipping.adapter).toBe("Manual (PirateShip) + Shippo (registered)");
    expect(shipping.status).toBe("active");
    expect(shipping.detail).toMatch(/shippo/i);
  });

  it("reports manual-only shipping when SHIPPO_API_TOKEN is unset", () => {
    vi.stubEnv("SHIPPO_API_TOKEN", "");

    const shipping = getAdapterInfo().find((e) => e.subsystem === "Shipping")!;
    expect(shipping.adapter).toBe("Manual (PirateShip)");
    expect(shipping.status).toBe("active");
  });

  it("is not cached/memoized -- two calls with different env values in between reflect the current environment each time", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const before = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(before.status).toBe("active");
    expect(before.adapter).toBe("Sandbox (demo mode)");

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xyz");
    const after = getAdapterInfo().find((e) => e.subsystem === "Payments")!;
    expect(after.status).toBe("active");
    expect(after.adapter).toBe("Stripe");
    expect(after.detail).toMatch(/test/i);
  });

  it("always returns exactly six entries in the same subsystem order, persistence and CMS always active regardless of env", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_xyz");
    vi.stubEnv("POSTHOG_API_KEY", "phc_xyz");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");

    const info = getAdapterInfo();
    expect(info).toHaveLength(8);
    expect(info.map((e) => e.subsystem)).toEqual([
      "Persistence (catalog)",
      "CMS",
      "Payments",
      "Analytics",
      "Fulfillment",
      "Shipping",
      "Image CDN",
      "Inventory",
    ]);
    // DATABASE_URL is set (real-shaped) in this test -- inventory should
    // report the real Postgres adapter, not the in-memory default.
    expect(info.find((e) => e.subsystem === "Inventory")?.adapter).toBe("Postgres");
    // Persistence and CMS are always "active" (every one of their 2-3
    // states is a valid, functional configuration) -- same as every other
    // row now that payments' unset-key state is a real sandbox adapter
    // rather than "unconfigured"; no row in this file's output currently
    // reports "unconfigured" at all.
    expect(info[0]!.status).toBe("active");
    expect(info[1]!.status).toBe("active");
  });

  describe("per-demo-backend-diversity: demo-aware Persistence/Inventory", () => {
    it("two demos with different per-demo overrides report genuinely different Persistence adapters", () => {
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("PRINT_SHOP_DATABASE_URL", "postgres://user:pass@localhost:5432/db");
      vi.stubEnv("NORTHLINE_MONGODB_URL", "mongodb+srv://user:pass@cluster0.mongodb.net/northline");

      const printShop = getAdapterInfo("print-shop").find((e) => e.subsystem === "Persistence (catalog)")!;
      const northline = getAdapterInfo("northline").find((e) => e.subsystem === "Persistence (catalog)")!;

      expect(printShop.adapter).toBe("Postgres");
      expect(northline.adapter).toBe("MongoDB");
    });

    it("a demo with no per-demo override falls back to the global chain, same as before this epic", () => {
      vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost:5432/db");

      const broadleaf = getAdapterInfo("broadleaf").find((e) => e.subsystem === "Persistence (catalog)")!;
      expect(broadleaf.adapter).toBe("Postgres");
    });

    it("Inventory follows Persistence per-demo -- Postgres for a demo resolving to Postgres, in-memory otherwise", () => {
      vi.stubEnv("DATABASE_URL", "");
      vi.stubEnv("PRINT_SHOP_DATABASE_URL", "postgres://user:pass@localhost:5432/db");
      vi.stubEnv("BROADLEAF_CONVEX_URL", "https://kindhearted-corgi-798.convex.cloud");

      const printShopInventory = getAdapterInfo("print-shop").find((e) => e.subsystem === "Inventory")!;
      const broadleafInventory = getAdapterInfo("broadleaf").find((e) => e.subsystem === "Inventory")!;

      expect(printShopInventory.adapter).toBe("Postgres");
      expect(broadleafInventory.adapter).toBe("In-memory (reference default)");
    });

    it("calling with no demoSlug at all still returns a complete, non-crashing AdapterInfo[] (the /architecture no-arg fallback case)", () => {
      vi.stubEnv("DATABASE_URL", "");
      const info = getAdapterInfo();
      expect(info).toHaveLength(8);
      expect(info.find((e) => e.subsystem === "Persistence (catalog)")).toBeDefined();
    });
  });
});
