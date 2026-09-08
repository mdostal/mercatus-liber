/**
 * Injectable GraphQL client against Shopify's Admin API. Defaults to global
 * fetch; tests inject a recording fake -- same disclosed-double pattern as
 * adapter-postgres's fake-pool.ts (no live Shopify store exists in this
 * environment, see this epic's docs/shopify-adapter-mapping.md).
 */
export interface ShopifyAdapterConfig {
  /** e.g. "my-shop.myshopify.com" */
  shop: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

export class ShopifyGraphQLError extends Error {
  constructor(message: string) {
    super(`Shopify GraphQL error: ${message}`);
    this.name = "ShopifyGraphQLError";
  }
}

export interface GraphQLClient {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

const DEFAULT_API_VERSION = "2025-01";

export function createGraphQLClient(config: ShopifyAdapterConfig): GraphQLClient {
  const apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  const url = `https://${config.shop}/admin/api/${apiVersion}/graphql.json`;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": config.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });
      const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
      if (json.errors && json.errors.length > 0) {
        throw new ShopifyGraphQLError(json.errors.map((e) => e.message).join("; "));
      }
      return json.data as T;
    },
  };
}
