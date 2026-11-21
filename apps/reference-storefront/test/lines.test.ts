import { afterEach, describe, expect, it, vi } from "vitest";

async function servicesFor(slug: "print-shop" | "northline") {
  for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_URI", "CONVEX_URL", "SQLITE_FILE_PATH", "SANITY_PROJECT_ID"]) vi.stubEnv(key, "");
  vi.resetModules();
  const { getServicesForDemo, __resetServicesCacheForTests } = await import("../lib/services");
  __resetServicesCacheForTests();
  return getServicesForDemo(slug);
}

describe("lines in the demo", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists print-shop's lines soonest first with their state, and only in print-shop", async () => {
    const { listLinesForDemo } = await import("../lib/lines");
    const s = await servicesFor("print-shop");
    const lines = await listLinesForDemo(s.catalog, "print-shop", new Date("2026-11-29T00:00:00Z"));
    expect(lines.map((l) => [l.line.slug, l.lifecycle.state])).toEqual([
      ["fleece-favorites", "active"],
      ["holiday-week-one", "upcoming"],
    ]);
    expect(await listLinesForDemo(s.catalog, "northline")).toEqual([]);
  });

  it("gives a line its landing page by section, and none for another demo", async () => {
    const { getLineForDemo } = await import("../lib/lines");
    const s = await servicesFor("print-shop");
    const landing = (await getLineForDemo(s.catalog, "print-shop", "holiday-week-one", new Date("2026-12-01T00:00:00Z")))!;
    expect(landing.lifecycle.state).toBe("active");
    expect(landing.sections.map((x) => [x.slug, x.products.length])).toEqual([["drinkware", 2], ["coasters", 2], ["accessories", 2]]);
    expect(await getLineForDemo(s.catalog, "northline", "holiday-week-one")).toBeNull();
    expect(await getLineForDemo(s.catalog, "print-shop", "the-print-shop")).toBeNull();
  });
});
