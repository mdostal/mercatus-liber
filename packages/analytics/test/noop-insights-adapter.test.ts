import { describe, expect, it, vi } from "vitest";
import { createNoopInsightsAdapter } from "../src/noop-insights-adapter.js";

describe("createNoopInsightsAdapter", () => {
  const range = { from: "2026-08-01", to: "2026-09-01" };

  it("getTrafficSources resolves with a real empty array", async () => {
    await expect(createNoopInsightsAdapter().getTrafficSources(range)).resolves.toEqual([]);
  });

  it("getPageViews resolves with a real empty array", async () => {
    await expect(createNoopInsightsAdapter().getPageViews(range)).resolves.toEqual([]);
  });

  it("getTopReferrers resolves with a real empty array", async () => {
    await expect(createNoopInsightsAdapter().getTopReferrers(range)).resolves.toEqual([]);
  });

  it("makes zero external calls -- global fetch is never touched", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const adapter = createNoopInsightsAdapter();
    await adapter.getTrafficSources(range);
    await adapter.getPageViews(range);
    await adapter.getTopReferrers(range);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
