/**
 * analytics-insights-02: proves lib/services.ts's Traffic & Sources insights
 * wiring -- same "env var truthy picks the real adapter, else a harmless
 * local fallback" shape as the CMS/admin-auth/analytics branches (see
 * cms-persistence-wiring.test.ts and analytics-wiring.test.ts), but with two
 * independently-configurable sources (PostHog Query API, GA4 Data API) each
 * carrying an explicit `configured` flag the admin page uses to render an
 * honest not-configured state (see app/demo/[demoSlug]/admin/metrics/page.tsx).
 *
 * No live PostHog personal-API-key or GA4 service-account credential exists
 * in this environment (see this story's final report), so
 * createPostHogInsightsAdapter/createGa4InsightsAdapter are mocked here to
 * record the config they're called with and return a real
 * createNoopInsightsAdapter() under the hood -- exactly the
 * cms-persistence-wiring.test.ts pattern. vi.resetModules() before each
 * dynamic import of lib/services.ts is required because getServicesForDemo()
 * memoizes its result in a module-scoped Map.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const createPostHogInsightsAdapterMock = vi.fn();
const createGa4InsightsAdapterMock = vi.fn();

vi.mock("@mercatus-liber/analytics", async () => {
  const actual = await vi.importActual<typeof import("@mercatus-liber/analytics")>("@mercatus-liber/analytics");
  return {
    ...actual,
    createPostHogInsightsAdapter: (config: unknown) => {
      createPostHogInsightsAdapterMock(config);
      return actual.createNoopInsightsAdapter();
    },
    createGa4InsightsAdapter: (config: unknown) => {
      createGa4InsightsAdapterMock(config);
      return actual.createNoopInsightsAdapter();
    },
  };
});

const range = { from: "2026-01-01", to: "2026-02-01" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createPostHogInsightsAdapterMock.mockClear();
  createGa4InsightsAdapterMock.mockClear();
});

describe("Traffic & Sources insights wiring (lib/services.ts)", () => {
  it("neither PostHog nor GA4 insights configured -- both sources marked not configured, real empty results, zero adapter construction", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
    vi.stubEnv("POSTHOG_PROJECT_ID", "");
    vi.stubEnv("GA4_PROPERTY_ID", "");
    vi.stubEnv("GA4_SERVICE_ACCOUNT_EMAIL", "");
    vi.stubEnv("GA4_PRIVATE_KEY", "");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostHogInsightsAdapterMock).not.toHaveBeenCalled();
    expect(createGa4InsightsAdapterMock).not.toHaveBeenCalled();

    expect(services.insightsSources.map((s) => ({ provider: s.provider, label: s.label, configured: s.configured }))).toEqual([
      { provider: "posthog", label: "PostHog", configured: false },
      { provider: "ga4", label: "Google Analytics (GA4)", configured: false },
    ]);

    for (const source of services.insightsSources) {
      await expect(source.adapter.getTrafficSources(range)).resolves.toEqual([]);
      await expect(source.adapter.getPageViews(range)).resolves.toEqual([]);
      await expect(source.adapter.getTopReferrers(range)).resolves.toEqual([]);
    }
  });

  it("constructs createPostHogInsightsAdapter with env-derived config (distinct personal-key/project-id/app-host vars) and marks it configured, independently of GA4", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx_personal_test");
    vi.stubEnv("POSTHOG_PROJECT_ID", "998877");
    vi.stubEnv("POSTHOG_APP_HOST", "https://eu.posthog.com");
    vi.stubEnv("GA4_PROPERTY_ID", "");
    vi.stubEnv("GA4_SERVICE_ACCOUNT_EMAIL", "");
    vi.stubEnv("GA4_PRIVATE_KEY", "");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createPostHogInsightsAdapterMock).toHaveBeenCalledTimes(1);
    expect(createPostHogInsightsAdapterMock).toHaveBeenCalledWith({
      personalApiKey: "phx_personal_test",
      projectId: "998877",
      host: "https://eu.posthog.com",
    });
    expect(createGa4InsightsAdapterMock).not.toHaveBeenCalled();

    const postHogSource = services.insightsSources.find((s) => s.provider === "posthog")!;
    const ga4Source = services.insightsSources.find((s) => s.provider === "ga4")!;
    expect(postHogSource.configured).toBe(true);
    expect(ga4Source.configured).toBe(false);
  });

  it("constructs createGa4InsightsAdapter with env-derived config, unescaping literal \\n sequences in GA4_PRIVATE_KEY into real newlines, and marks it configured, independently of PostHog", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
    vi.stubEnv("POSTHOG_PROJECT_ID", "");
    vi.stubEnv("GA4_PROPERTY_ID", "445566");
    vi.stubEnv("GA4_SERVICE_ACCOUNT_EMAIL", "ga4-reader@my-project.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nABCD\\n-----END PRIVATE KEY-----\\n");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(createGa4InsightsAdapterMock).toHaveBeenCalledTimes(1);
    expect(createGa4InsightsAdapterMock).toHaveBeenCalledWith({
      propertyId: "445566",
      serviceAccountEmail: "ga4-reader@my-project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----\n",
    });
    expect(createPostHogInsightsAdapterMock).not.toHaveBeenCalled();

    const postHogSource = services.insightsSources.find((s) => s.provider === "posthog")!;
    const ga4Source = services.insightsSources.find((s) => s.provider === "ga4")!;
    expect(postHogSource.configured).toBe(false);
    expect(ga4Source.configured).toBe(true);
  });

  it("both configured -- both marked configured, side by side, each adapter constructed with its own real config", async () => {
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "phx_personal_test");
    vi.stubEnv("POSTHOG_PROJECT_ID", "998877");
    vi.stubEnv("GA4_PROPERTY_ID", "445566");
    vi.stubEnv("GA4_SERVICE_ACCOUNT_EMAIL", "ga4-reader@my-project.iam.gserviceaccount.com");
    vi.stubEnv("GA4_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nABCD\\n-----END PRIVATE KEY-----\\n");
    vi.resetModules();

    const { getServicesForDemo } = await import("../lib/services.js");
    const services = await getServicesForDemo("print-shop");

    expect(services.insightsSources.every((s) => s.configured)).toBe(true);
    expect(createPostHogInsightsAdapterMock).toHaveBeenCalledTimes(1);
    expect(createGa4InsightsAdapterMock).toHaveBeenCalledTimes(1);
  });
});
