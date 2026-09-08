/**
 * A stateful fake Shopify Admin GraphQL API double -- NOT a real Shopify
 * store. No live Shopify store/credentials exist in this environment (same
 * disclosed gap as adapter-postgres's fake-pool.ts and payments' mocked
 * Stripe SDK). Recognizes exactly the fixed, known set of GraphQL
 * operations @mercatus-liber/adapter-shopify issues and serves them from
 * in-memory Maps with real create/update/search semantics, so the
 * adapter's own query-construction and id-bridging logic is genuinely
 * exercised -- it does NOT validate against Shopify's real GraphQL schema,
 * rate limits, or wire behavior. Real integration verification against a
 * live Shopify store is a documented follow-up, not fabricated here.
 */
const EXTERNAL_ID_META_KEY = "mercatus_liber.external_id";

interface FakeMetafields {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  entries(): [string, string][];
}

function metafieldMap(): FakeMetafields {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    delete: (key) => void map.delete(key),
    entries: () => [...map.entries()],
  };
}

interface FakeVariant {
  id: string;
  price: string;
  selectedOptions: { name: string; value: string }[];
  metafields: FakeMetafields;
}

interface FakeProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  optionNames: string[];
  metafields: FakeMetafields;
  variants: Map<string, FakeVariant>;
}

function productNode(p: FakeProduct) {
  const externalId = p.metafields.get(EXTERNAL_ID_META_KEY);
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    descriptionHtml: p.descriptionHtml,
    status: p.status,
    options: p.optionNames.map((name) => ({ name })),
    metafield: externalId !== undefined ? { value: externalId } : null,
  };
}

function variantNode(v: FakeVariant) {
  const externalId = v.metafields.get(EXTERNAL_ID_META_KEY);
  return {
    id: v.id,
    price: v.price,
    selectedOptions: v.selectedOptions,
    metafield: externalId !== undefined ? { value: externalId } : null,
  };
}

export function createFakeShopifyFetch(): typeof fetch {
  const products = new Map<string, FakeProduct>();
  let nextProductId = 1;
  let nextVariantId = 1;

  function findVariantByExternalId(id: string): { variant: FakeVariant; product: FakeProduct } | undefined {
    for (const product of products.values()) {
      for (const variant of product.variants.values()) {
        if (variant.metafields.get(EXTERNAL_ID_META_KEY) === id) return { variant, product };
      }
    }
    return undefined;
  }

  const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables?: Record<string, unknown> };
    const { query, variables } = body;
    const respond = (data: unknown) => ({ json: async () => ({ data }) }) as unknown as Response;

    // --- products(first, query) -- external-id search or list() ---
    if (query.includes("products(first: 1, query: $query)") || query.includes("products(first: 250, query: $query)")) {
      const q = variables?.query as string | undefined;
      let matches = [...products.values()];
      if (q?.includes("metafields.mercatus_liber.external_id:")) {
        const id = q.match(/external_id:'([^']+)'/)?.[1];
        matches = matches.filter((p) => p.metafields.get(EXTERNAL_ID_META_KEY) === id);
      } else if (q) {
        for (const clause of q.split(" ")) {
          const [field, value] = clause.split(":");
          matches = matches.filter((p) => (field === "status" ? p.status === value?.toUpperCase() : field === "handle" ? p.handle === value : true));
        }
      }
      return respond({ products: { nodes: matches.map(productNode) } });
    }

    // --- productByHandle ---
    if (query.includes("productByHandle(handle: $handle)")) {
      const handle = variables?.handle as string;
      const found = [...products.values()].find((p) => p.handle === handle);
      return respond({ productByHandle: found ? productNode(found) : null });
    }

    // --- productSet (create or update) ---
    if (query.includes("productSet(input: $input)")) {
      const input = variables?.input as {
        id?: string;
        title: string;
        handle: string;
        descriptionHtml: string;
        status: string;
        productOptions: { name: string }[];
        metafields: { namespace: string; key: string; value: string }[];
      };
      let product = input.id ? products.get(input.id) : undefined;
      if (!product) {
        product = {
          id: `gid://shopify/Product/${nextProductId++}`,
          handle: input.handle,
          title: input.title,
          descriptionHtml: input.descriptionHtml,
          status: input.status as FakeProduct["status"],
          optionNames: input.productOptions.map((o) => o.name),
          metafields: metafieldMap(),
          variants: new Map(),
        };
        products.set(product.id, product);
      } else {
        product.handle = input.handle;
        product.title = input.title;
        product.descriptionHtml = input.descriptionHtml;
        product.status = input.status as FakeProduct["status"];
        product.optionNames = input.productOptions.map((o) => o.name);
      }
      for (const mf of input.metafields) product.metafields.set(`${mf.namespace}.${mf.key}`, mf.value);
      return respond({ productSet: { product: { id: product.id }, userErrors: [] } });
    }

    // --- productVariants(first, query) -- external-id search ---
    if (query.includes("productVariants(first: 1, query: $query)")) {
      const q = variables?.query as string;
      const id = q.match(/external_id:'([^']+)'/)?.[1];
      const found = id ? findVariantByExternalId(id) : undefined;
      return respond({
        productVariants: { nodes: found ? [{ ...variantNode(found.variant), product: { id: found.product.id, status: found.product.status } }] : [] },
      });
    }

    // --- product(id) { ... variants(first) ... } (shared by listByProduct + save's lookup) ---
    // Checked before the two metafield branches below: VARIANT_FIELDS embeds a
    // per-variant "metafield(namespace:" fragment too, so this must win first.
    if (query.includes("product(id: $id)") && query.includes("variants(first: 250)")) {
      const id = variables?.id as string;
      const product = products.get(id);
      if (!product) return respond({ product: null });
      return respond({ product: { status: product.status, variants: { nodes: [...product.variants.values()].map(variantNode) } } });
    }

    // --- product(id) { metafields(namespace: "mercatus_liber_attr", ...) } ---
    if (query.includes("product(id: $id)") && query.includes("metafields(namespace:")) {
      const id = variables?.id as string;
      const product = products.get(id);
      if (!product) return respond({ product: null });
      const nodes = product.metafields.entries().filter(([k]) => k.startsWith("mercatus_liber_attr.")).map(([k, value]) => ({ key: k.slice("mercatus_liber_attr.".length), value }));
      return respond({ product: { metafields: { nodes } } });
    }

    // --- product(id) { id metafield(namespace: "mercatus_liber", ...) } (resolveExternalProductId) ---
    if (query.includes("product(id: $id)") && query.includes("metafield(namespace:")) {
      const id = variables?.id as string;
      const product = products.get(id);
      if (!product) return respond({ product: null });
      return respond({ product: productNode(product) });
    }

    // --- productVariantsBulkCreate ---
    if (query.includes("productVariantsBulkCreate(")) {
      const productId = variables?.productId as string;
      const variantsInput = variables?.variants as { price: string; optionValues: { optionName: string; name: string }[]; metafields: { namespace: string; key: string; value: string }[] }[];
      const product = products.get(productId)!;
      const created: { id: string }[] = [];
      for (const v of variantsInput) {
        const variant: FakeVariant = {
          id: `gid://shopify/ProductVariant/${nextVariantId++}`,
          price: v.price,
          selectedOptions: v.optionValues.map((ov) => ({ name: ov.optionName, value: ov.name })),
          metafields: metafieldMap(),
        };
        for (const mf of v.metafields) variant.metafields.set(`${mf.namespace}.${mf.key}`, mf.value);
        product.variants.set(variant.id, variant);
        created.push({ id: variant.id });
      }
      return respond({ productVariantsBulkCreate: { productVariants: created, userErrors: [] } });
    }

    // --- productVariantsBulkUpdate ---
    if (query.includes("productVariantsBulkUpdate(")) {
      const productId = variables?.productId as string;
      const variantsInput = variables?.variants as { id: string; price: string; optionValues: { optionName: string; name: string }[]; metafields: { namespace: string; key: string; value: string }[] }[];
      const product = products.get(productId)!;
      for (const v of variantsInput) {
        const variant = product.variants.get(v.id)!;
        variant.price = v.price;
        variant.selectedOptions = v.optionValues.map((ov) => ({ name: ov.optionName, value: ov.name }));
        for (const mf of v.metafields) variant.metafields.set(`${mf.namespace}.${mf.key}`, mf.value);
      }
      return respond({ productVariantsBulkUpdate: { productVariants: variantsInput.map((v) => ({ id: v.id })), userErrors: [] } });
    }

    // --- metafieldsSet ---
    if (query.includes("metafieldsSet(")) {
      const metafields = variables?.metafields as { ownerId: string; namespace: string; key: string; value: string }[];
      for (const mf of metafields) {
        const owner = products.get(mf.ownerId) ?? [...products.values()].flatMap((p) => [...p.variants.values()]).find((v) => v.id === mf.ownerId);
        owner?.metafields.set(`${mf.namespace}.${mf.key}`, mf.value);
      }
      return respond({ metafieldsSet: { metafields: metafields.map(() => ({ id: `gid://shopify/Metafield/${nextVariantId++}` })), userErrors: [] } });
    }

    // --- metafieldsDelete ---
    if (query.includes("metafieldsDelete(")) {
      const metafields = variables?.metafields as { ownerId: string; namespace: string; key: string }[];
      for (const mf of metafields) {
        const owner = products.get(mf.ownerId) ?? [...products.values()].flatMap((p) => [...p.variants.values()]).find((v) => v.id === mf.ownerId);
        owner?.metafields.delete(`${mf.namespace}.${mf.key}`);
      }
      return respond({ metafieldsDelete: { deletedMetafields: metafields.map((m) => ({ key: m.key })), userErrors: [] } });
    }

    throw new Error(`FakeShopifyFetch: unrecognized GraphQL operation -- ${query.slice(0, 120)}`);
  };

  return fakeFetch as unknown as typeof fetch;
}
