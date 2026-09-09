/**
 * cms-disc-01: proves lib/services.ts's CMS persistence branch -- same
 * "env var truthy picks the real adapter, else a harmless local fallback"
 * shape as the analytics/admin-auth branches (see analytics-wiring.test.ts
 * and adapter-info.test.ts). No live Sanity project exists in this
 * environment (see cms-disc-01-wire-and-document.yaml), so
 * @mercatus-liber/adapter-sanity's createSanityAdapter is mocked here to
 * record the config it's called with, and to return a real
 * createInMemoryCmsAdapter() under the hood so the rest of buildServices()
 * (which seeds real CMS pages during construction) never makes a network
 * call. vi.resetModules() before each dynamic import of lib/services.ts is
 * required because getServicesForDemo() memoizes its result in a
 * module-scoped Map -- without a fresh module instance per test, the second
 * test would just observe the first test's cached Services object.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const createSanityAdapterMock = vi.fn();

vi.mock("@mercatus-liber/adapter-sanity", async () => {
  const { createInMemoryCmsAdapter } = await import("@mercatus-liber/cms");
  return {
    createSanityAdapter: (config: unknown) => {
      createSanityAdapterMock(config);
      return createInMemoryCmsAdapter();
    },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createSanityAdapterMock.mockClear();
});

describe("CMS persistence wiring (lib/services.ts)", () => {
  it("falls back to the in-memory CMS adapter when SANITY_PROJECT_ID is unset -- zero regression", async () => {
    vi.stubEnv("SANITY_PROJECT_ID", "");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move

    expect(createSanityAdapterMock).not.toHaveBeenCalled();
    // The CMS service itself is still fully functional off the in-memory
    // fallback -- the default seed's home page is there, same as before
    // this epic.
    expect(await services.cms.getPageBySlug("home")).not.toBeNull();
  });

  it("constructs createSanityAdapter with env-derived config when SANITY_PROJECT_ID is set", async () => {
    vi.stubEnv("SANITY_PROJECT_ID", "proj123");
    vi.stubEnv("SANITY_DATASET", "staging");
    vi.stubEnv("SANITY_TOKEN", "tok_abc");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move

    expect(createSanityAdapterMock).toHaveBeenCalledTimes(1);
    expect(createSanityAdapterMock).toHaveBeenCalledWith({
      projectId: "proj123",
      dataset: "staging",
      token: "tok_abc",
    });
  });

  it("defaults SANITY_DATASET to 'production' and SANITY_TOKEN to '' when only SANITY_PROJECT_ID is set", async () => {
    vi.stubEnv("SANITY_PROJECT_ID", "proj123");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move

    expect(createSanityAdapterMock).toHaveBeenCalledWith({
      projectId: "proj123",
      dataset: "production",
      token: "",
    });
  });
});
