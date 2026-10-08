import type { GraphQLClient } from "@mercatus-liber/adapter-shopify";

/**
 * A stateful fake Shopify Admin GraphQL API double -- NOT a real Shopify
 * store. Same disclosed-double shape as adapter-shopify's own
 * test/fake-shopify-store.ts (recognizes exactly the fixed, known set of
 * GraphQL operations this package issues and serves them from in-memory
 * fixtures with real pagination semantics, so this package's own
 * query-construction and cursor-following logic is genuinely exercised --
 * it does NOT validate against Shopify's real GraphQL schema, rate limits,
 * or wire behavior). Implemented one layer lower than fake-shopify-store.ts
 * (against the `GraphQLClient.request` interface from adapter-shopify's
 * graphql-client.ts, rather than against `fetch` itself) because this
 * package's reader functions are written against that interface directly --
 * production code still goes through the real `createGraphQLClient` /
 * `fetch` transport, which is adapter-shopify's own, already-tested code,
 * reused rather than re-tested here.
 */

export interface FakeLocationLevel {
  locationId: string;
  locationName: string;
  onHand: number;
  available: number;
}

export interface FakeVariant {
  id: string;
  price: string;
  selectedOptions: { name: string; value: string }[];
  externalId?: string;
  inventoryItemId: string;
  inventoryLevels: FakeLocationLevel[];
}

export interface FakeProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  optionNames: string[];
  externalId?: string;
  variants: FakeVariant[];
}

export interface FakeCollection {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productHandles: string[];
}

export interface FakeShopifyStoreData {
  products: FakeProduct[];
  collections: FakeCollection[];
}

interface Page<T> {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Real slice-based cursor pagination over an in-memory array -- cursors are just stringified indexes, opaque to callers exactly as Shopify's real cursors are. */
function paginate<T>(items: T[], first: number, after: string | null | undefined): Page<T> {
  const start = after != null ? Number(after) + 1 : 0;
  const nodes = items.slice(start, start + first);
  const end = start + nodes.length - 1;
  return {
    nodes,
    pageInfo: {
      hasNextPage: start + nodes.length < items.length,
      endCursor: nodes.length > 0 ? String(end) : null,
    },
  };
}

/** Pulls a literal `<fieldName>(first: <N>)` page size back out of a query string -- needed because this package's nested connections (a product's variants, a variant's inventory levels, a collection's products) bake their page size into the query text itself rather than sending it as a GraphQL variable (only the top-level connection in each query uses `$first`/`$after`). */
function literalFirst(query: string, fieldName: string, fallback: number): number {
  const match = query.match(new RegExp(`${fieldName}\\(first:\\s*(\\d+)`));
  return match ? Number(match[1]) : fallback;
}

function metafieldFor(externalId: string | undefined): { value: string } | null {
  return externalId !== undefined ? { value: externalId } : null;
}

function inventoryLevelNode(level: FakeLocationLevel) {
  return {
    location: { id: level.locationId, name: level.locationName },
    quantities: [
      { name: "on_hand", quantity: level.onHand },
      { name: "available", quantity: level.available },
    ],
  };
}

function variantNode(v: FakeVariant, query: string) {
  const levelsFirst = literalFirst(query, "inventoryLevels", 50);
  const levelsPage = paginate(v.inventoryLevels, levelsFirst, null);
  return {
    id: v.id,
    price: v.price,
    selectedOptions: v.selectedOptions,
    metafield: metafieldFor(v.externalId),
    inventoryItem: {
      id: v.inventoryItemId,
      inventoryLevels: { nodes: levelsPage.nodes.map(inventoryLevelNode), pageInfo: levelsPage.pageInfo },
    },
  };
}

function productNode(p: FakeProduct, query: string) {
  const variantsFirst = literalFirst(query, "variants", 250);
  const variantsPage = paginate(p.variants, variantsFirst, null);
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.descriptionHtml,
    status: p.status,
    options: p.optionNames.map((name) => ({ name })),
    metafield: metafieldFor(p.externalId),
    variants: { nodes: variantsPage.nodes.map((v) => variantNode(v, query)), pageInfo: variantsPage.pageInfo },
  };
}

function collectionNode(c: FakeCollection, query: string) {
  const productsFirst = literalFirst(query, "products", 250);
  const page = paginate(c.productHandles, productsFirst, null);
  return {
    id: c.id,
    handle: c.handle,
    title: c.title,
    description: c.description,
    descriptionHtml: c.descriptionHtml,
    products: { nodes: page.nodes.map((handle) => ({ handle })), pageInfo: page.pageInfo },
  };
}

export function createFakeGraphQLClient(data: FakeShopifyStoreData): GraphQLClient {
  return {
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const first = (variables?.first as number | undefined) ?? 250;
      const after = (variables?.after as string | null | undefined) ?? null;

      if (query.includes("MigrateShopifyProducts(")) {
        const page = paginate(data.products, first, after);
        return { products: { nodes: page.nodes.map((p) => productNode(p, query)), pageInfo: page.pageInfo } } as T;
      }

      if (query.includes("MigrateShopifyProductVariantsPage(")) {
        const id = variables?.id as string;
        const product = data.products.find((p) => p.id === id);
        if (!product) return { product: null } as T;
        const page = paginate(product.variants, first, after);
        return { product: { variants: { nodes: page.nodes.map((v) => variantNode(v, query)), pageInfo: page.pageInfo } } } as T;
      }

      if (query.includes("MigrateShopifyInventoryLevelsPage(")) {
        const id = variables?.id as string;
        const variant = data.products.flatMap((p) => p.variants).find((v) => v.inventoryItemId === id);
        if (!variant) return { inventoryItem: null } as T;
        const page = paginate(variant.inventoryLevels, first, after);
        return { inventoryItem: { inventoryLevels: { nodes: page.nodes.map(inventoryLevelNode), pageInfo: page.pageInfo } } } as T;
      }

      if (query.includes("MigrateShopifyCollections(")) {
        const page = paginate(data.collections, first, after);
        return { collections: { nodes: page.nodes.map((c) => collectionNode(c, query)), pageInfo: page.pageInfo } } as T;
      }

      if (query.includes("MigrateShopifyCollectionProductsPage(")) {
        const id = variables?.id as string;
        const collection = data.collections.find((c) => c.id === id);
        if (!collection) return { collection: null } as T;
        const page = paginate(collection.productHandles, first, after);
        return { collection: { products: { nodes: page.nodes.map((handle) => ({ handle })), pageInfo: page.pageInfo } } } as T;
      }

      throw new Error(`FakeGraphQLClient: unrecognized GraphQL operation -- ${query.slice(0, 120)}`);
    },
  };
}
