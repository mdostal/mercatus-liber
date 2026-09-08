/**
 * Injectable client against Sanity's real Content API -- the Query API
 * (GROQ, read-only, GET) and the Mutations API (createOrReplace/delete,
 * POST). Defaults to global fetch; tests inject a recording fake -- same
 * disclosed-double pattern as adapter-shopify's injectable GraphQL client
 * (no live Sanity project/token exists in this environment, see this
 * epic's docs/cms-adapters-design.md).
 */
export interface SanityAdapterConfig {
  projectId: string;
  dataset: string;
  token: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export class SanityApiError extends Error {
  constructor(message: string) {
    super(`Sanity API error: ${message}`);
    this.name = "SanityApiError";
  }
}

export interface SanityClient {
  query<T>(groq: string, params?: Record<string, unknown>): Promise<T>;
  mutate(mutations: Record<string, unknown>[]): Promise<void>;
}

const DEFAULT_API_VERSION = "2024-01-01";

export function createSanityClient(config: SanityAdapterConfig): SanityClient {
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const baseUrl = `https://${config.projectId}.api.sanity.io/v${apiVersion}/data`;
  const fetchImpl = config.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" };

  return {
    async query<T>(groq: string, params: Record<string, unknown> = {}): Promise<T> {
      const search = new URLSearchParams({ query: groq });
      for (const [key, value] of Object.entries(params)) {
        search.set(`$${key}`, JSON.stringify(value));
      }
      const response = await fetchImpl(`${baseUrl}/query/${config.dataset}?${search.toString()}`, { headers });
      const json = (await response.json()) as { result?: T; error?: { description: string } };
      if (json.error) throw new SanityApiError(json.error.description);
      return json.result as T;
    },

    async mutate(mutations: Record<string, unknown>[]): Promise<void> {
      const response = await fetchImpl(`${baseUrl}/mutate/${config.dataset}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mutations }),
      });
      const json = (await response.json()) as { error?: { description: string } };
      if (json.error) throw new SanityApiError(json.error.description);
    },
  };
}
