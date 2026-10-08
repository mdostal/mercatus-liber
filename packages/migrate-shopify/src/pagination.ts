/**
 * Shared cursor-pagination plumbing against Shopify's Admin GraphQL API.
 * Every connection this tool reads (products, a product's variants,
 * collections, a collection's products, a variant's inventory levels) uses
 * the same Relay-style `{ nodes, pageInfo { hasNextPage endCursor } }`
 * shape, verified directly against Shopify's current docs (see
 * api-version.ts) -- so pagination logic is written once here and reused
 * everywhere, rather than re-implemented per connection.
 */

export interface ShopifyPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface ShopifyConnection<T> {
  nodes: T[];
  pageInfo: ShopifyPageInfo;
}

/**
 * Fully drains a top-level connection, starting from its first page
 * (cursor `null`), by repeatedly calling `fetchPage` with the previous
 * page's `endCursor` until `hasNextPage` is false.
 */
export async function drainConnection<T>(fetchPage: (cursor: string | null) => Promise<ShopifyConnection<T>>): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return all;
    cursor = page.pageInfo.endCursor;
  }
}

/**
 * Drains whatever pages remain *after* a connection's first page, which is
 * the shape every nested connection in this tool arrives in (a product's
 * `variants`, a collection's `products`, a variant's `inventoryItem.
 * inventoryLevels`): the parent query already returned page 1 inline, and
 * this only needs to fetch page 2+ if `pageInfo.hasNextPage` said there was
 * more. Returns just the *additional* nodes -- callers concatenate them
 * after the first page's own nodes.
 */
export async function drainRemainingPages<T>(
  firstPageInfo: ShopifyPageInfo,
  fetchPage: (cursor: string) => Promise<ShopifyConnection<T>>,
): Promise<T[]> {
  const rest: T[] = [];
  let hasNextPage = firstPageInfo.hasNextPage;
  let cursor = firstPageInfo.endCursor;
  while (hasNextPage && cursor) {
    const page = await fetchPage(cursor);
    rest.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return rest;
}
