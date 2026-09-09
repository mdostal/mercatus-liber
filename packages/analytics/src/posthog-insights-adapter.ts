import type { AnalyticsInsightsAdapter, AnalyticsInsightsRange, PageViewRow, TopReferrerRow, TrafficSourceRow } from "./types.js";

const PROVIDER = "posthog";

/**
 * PostHog's default **app** API host for the Query API (not the ingestion
 * host used for event capture -- see the `host` doc comment below).
 */
const DEFAULT_APP_HOST = "https://us.posthog.com";

export interface PostHogInsightsAdapterConfig {
  /**
   * RESEARCH FINDING (per PostHog's real, current docs -- posthog.com/docs/sql,
   * posthog.com/docs/api/queries -- checked during implementation, not
   * assumed): the Query API requires a distinct **personal API key** with the
   * "Query Read" (`query:read`) permission, created under
   * https://<host>/settings/user-api-keys. The existing write-side
   * `POSTHOG_API_KEY` used by `createPostHogAdapter`/posthog-node's
   * `capture()` is a **project API key** -- a different credential type, scoped
   * only to ingestion, that PostHog's docs never list as valid for
   * `/api/projects/:id/query`. The two are not interchangeable: this adapter
   * cannot reuse the existing env var and requires its own, separately
   * disclosed credential.
   */
  personalApiKey: string;
  /** Numeric PostHog project ID (Project Settings -> project ID), required by the query endpoint path. */
  projectId: string;
  /**
   * PostHog **app** host, e.g. "https://us.posthog.com" (US cloud, default),
   * "https://eu.posthog.com" (EU cloud), or a self-hosted app URL. This is
   * deliberately a separate config value from write-side `POSTHOG_HOST`:
   * that one points at the *ingestion* host (`https://us.i.posthog.com` by
   * default) which does not serve the Query API.
   */
  host?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface HogQLQueryResponse {
  results: unknown[][];
  columns: string[];
}

function escapeHogQLString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * PostHog reference insights adapter -- wraps PostHog's real HogQL Query API
 * (`POST /api/projects/:project_id/query`, see posthog.com/docs/api/queries)
 * to answer read-side traffic/referrer questions the write-only
 * `createPostHogAdapter` can't. Constructed here (not injected), mirroring
 * posthog-adapter.ts's convention.
 */
export function createPostHogInsightsAdapter(config: PostHogInsightsAdapterConfig): AnalyticsInsightsAdapter {
  const host = config.host ?? DEFAULT_APP_HOST;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function runHogQLQuery(hogql: string, name: string): Promise<HogQLQueryResponse> {
    const response = await fetchImpl(`${host}/api/projects/${config.projectId}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.personalApiKey}`,
      },
      body: JSON.stringify({
        query: { kind: "HogQLQuery", query: hogql },
        name,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`PostHog Query API request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as HogQLQueryResponse;
  }

  function whereClause(range: AnalyticsInsightsRange): string {
    return `timestamp >= '${escapeHogQLString(range.from)}' AND timestamp < '${escapeHogQLString(range.to)}'`;
  }

  return {
    async getTrafficSources(range: AnalyticsInsightsRange): Promise<TrafficSourceRow[]> {
      const { results } = await runHogQLQuery(
        `SELECT coalesce(nullIf(properties.$referring_domain, ''), 'direct') AS source, count(DISTINCT properties.$session_id) AS sessions
         FROM events
         WHERE event = '$pageview' AND ${whereClause(range)}
         GROUP BY source
         ORDER BY sessions DESC`,
        "traffic sources by referring domain",
      );

      return results.map((row) => ({
        provider: PROVIDER,
        source: String(row[0]),
        sessions: Number(row[1]),
      }));
    },

    async getPageViews(range: AnalyticsInsightsRange): Promise<PageViewRow[]> {
      const { results } = await runHogQLQuery(
        `SELECT properties.$pathname AS path, count() AS views
         FROM events
         WHERE event = '$pageview' AND ${whereClause(range)}
         GROUP BY path
         ORDER BY views DESC`,
        "page views by path",
      );

      return results.map((row) => ({
        provider: PROVIDER,
        path: String(row[0]),
        views: Number(row[1]),
      }));
    },

    async getTopReferrers(range: AnalyticsInsightsRange): Promise<TopReferrerRow[]> {
      const { results } = await runHogQLQuery(
        `SELECT coalesce(nullIf(properties.$referrer, ''), 'direct') AS referrer, count() AS count
         FROM events
         WHERE event = '$pageview' AND ${whereClause(range)}
         GROUP BY referrer
         ORDER BY count DESC`,
        "top referrers",
      );

      return results.map((row) => ({
        provider: PROVIDER,
        referrer: String(row[0]),
        count: Number(row[1]),
      }));
    },
  };
}
