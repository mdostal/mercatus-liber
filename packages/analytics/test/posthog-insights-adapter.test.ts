import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPostHogInsightsAdapter } from "../src/posthog-insights-adapter.js";

/**
 * Mocked responses shaped like PostHog's real, current Query API
 * (`POST /api/projects/:project_id/query`, HogQLQuery) -- `results` as an
 * array of row-arrays and `columns` naming them in the same order, per
 * posthog.com/docs/api/queries and posthog.com/docs/endpoints/execution.
 */
function jsonResponse(body: unknown, init?: { status?: number }) {
  return {
    ok: (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("createPostHogInsightsAdapter", () => {
  const range = { from: "2026-08-01T00:00:00Z", to: "2026-09-01T00:00:00Z" };
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("getTrafficSources posts a HogQLQuery request to the real query endpoint with the personal API key, and maps results with provider attribution", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        results: [
          ["google.com", 42],
          ["direct", 17],
        ],
        columns: ["source", "sessions"],
        types: ["String", "UInt64"],
      }),
    );

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "phx_test_personal_key",
      projectId: "12345",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.getTrafficSources(range);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us.posthog.com/api/projects/12345/query");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer phx_test_personal_key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(init.body as string);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toContain("FROM events");
    expect(body.query.query).toContain("$pageview");
    expect(body.query.query).toContain("2026-08-01T00:00:00Z");
    expect(body.query.query).toContain("2026-09-01T00:00:00Z");

    expect(result).toEqual([
      { provider: "posthog", source: "google.com", sessions: 42 },
      { provider: "posthog", source: "direct", sessions: 17 },
    ]);
  });

  it("getPageViews maps path/views rows with provider attribution", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        results: [
          ["/", 120],
          ["/products/widget", 55],
        ],
        columns: ["path", "views"],
      }),
    );

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "phx_test_personal_key",
      projectId: "12345",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.getPageViews(range);

    expect(result).toEqual([
      { provider: "posthog", path: "/", views: 120 },
      { provider: "posthog", path: "/products/widget", views: 55 },
    ]);
  });

  it("getTopReferrers maps referrer/count rows with provider attribution", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        results: [
          ["https://www.google.com/", 88],
          ["direct", 33],
        ],
        columns: ["referrer", "count"],
      }),
    );

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "phx_test_personal_key",
      projectId: "12345",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.getTopReferrers(range);

    expect(result).toEqual([
      { provider: "posthog", referrer: "https://www.google.com/", count: 88 },
      { provider: "posthog", referrer: "direct", count: 33 },
    ]);
  });

  it("uses a custom host when provided, instead of the us.posthog.com default", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ results: [], columns: ["referrer", "count"] }));

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "phx_test_personal_key",
      projectId: "999",
      host: "https://eu.posthog.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await adapter.getTopReferrers(range);

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu.posthog.com/api/projects/999/query");
  });

  it("throws a descriptive error when the Query API responds with a non-2xx status", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ type: "authentication_error", detail: "Invalid personal API key." }, { status: 401 }),
    );

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "bad_key",
      projectId: "12345",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(adapter.getTrafficSources(range)).rejects.toThrow(/PostHog Query API request failed \(401\)/);
  });

  it("returns an empty array when the query legitimately matches no rows", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse({ results: [], columns: ["path", "views"] }));

    const adapter = createPostHogInsightsAdapter({
      personalApiKey: "phx_test_personal_key",
      projectId: "12345",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(adapter.getPageViews(range)).resolves.toEqual([]);
  });
});
