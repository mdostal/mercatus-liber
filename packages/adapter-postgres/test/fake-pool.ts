/**
 * A stateful fake `pg.Pool` double -- NOT a real Postgres connection. No live
 * Postgres server exists in this environment (same disclosed gap as cf-05's
 * mocked Stripe SDK). This recognizes exactly the fixed, known set of SQL
 * statements @mercatus-liber/adapter-postgres issues and serves them from
 * in-memory Maps with real upsert/filter semantics, so the adapter's own
 * query-construction logic is genuinely exercised -- it does NOT validate
 * against real Postgres wire protocol, SQL dialect quirks, or JSONB
 * marshaling behavior. Real integration verification against a live
 * Postgres instance is a documented follow-up, not fabricated here.
 */
interface FakeRow {
  [key: string]: unknown;
}

export interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export function createFakePgPool(): FakePool {
  const products = new Map<string, FakeRow>();
  const skus = new Map<string, FakeRow>();
  const attributes = new Map<string, FakeRow>(); // keyed by `${productId}::${key}`
  const categories = new Map<string, FakeRow>();
  const assignments = new Map<string, FakeRow>(); // keyed by `${productId}::${categoryId}`

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      // --- products ---
      if (sql === "SELECT * FROM products WHERE id = $1") {
        const row = products.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM products WHERE slug = $1") {
        const row = [...products.values()].find((p) => p.slug === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM products") {
        return { rows: [...products.values()] as T[] };
      }
      if (sql === "SELECT * FROM products WHERE status = $1") {
        return { rows: [...products.values()].filter((p) => p.status === values[0]) as T[] };
      }
      if (sql === "SELECT * FROM products WHERE status = $1 AND slug = $2") {
        return {
          rows: [...products.values()].filter((p) => p.status === values[0] && p.slug === values[1]) as T[],
        };
      }
      if (sql.startsWith("INSERT INTO products")) {
        const [id, slug, title, description, identifyingAttributeKeys, status, images] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
        ];
        products.set(id, {
          id,
          slug,
          title,
          description,
          identifying_attribute_keys: JSON.parse(identifyingAttributeKeys),
          status,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here the same way
          // identifying_attribute_keys already is above.
          images: images ? JSON.parse(images) : null,
        });
        return { rows: [] };
      }

      // --- skus ---
      if (sql === "SELECT * FROM skus WHERE id = $1") {
        const row = skus.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM skus WHERE product_id = $1") {
        return { rows: [...skus.values()].filter((s) => s.product_id === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO skus")) {
        const [id, productId, identifyingAttributes, priceAmount, priceCurrency, status] = values as [
          string,
          string,
          string,
          number,
          string,
          string,
        ];
        skus.set(id, {
          id,
          product_id: productId,
          identifying_attributes: JSON.parse(identifyingAttributes),
          price_amount: priceAmount,
          price_currency: priceCurrency,
          status,
        });
        return { rows: [] };
      }

      // --- product_attributes ---
      if (sql === "SELECT * FROM product_attributes WHERE product_id = $1") {
        return { rows: [...attributes.values()].filter((a) => a.product_id === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO product_attributes")) {
        const [productId, key, value, facetable] = values as [string, string, string, boolean];
        attributes.set(`${productId}::${key}`, {
          product_id: productId,
          key,
          value: JSON.parse(value),
          facetable,
        });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM product_attributes")) {
        const [productId, key] = values as [string, string];
        attributes.delete(`${productId}::${key}`);
        return { rows: [] };
      }

      // --- categories ---
      if (sql === "SELECT * FROM categories WHERE id = $1") {
        const row = categories.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM categories WHERE slug = $1") {
        const row = [...categories.values()].find((c) => c.slug === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }
      if (sql === "SELECT * FROM categories") {
        return { rows: [...categories.values()] as T[] };
      }
      if (sql === "SELECT * FROM categories WHERE demo_slug = $1") {
        return { rows: [...categories.values()].filter((c) => c.demo_slug === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO categories")) {
        const [id, slug, title, description, parentId, demoSlug] = values as [
          string,
          string,
          string,
          string,
          string | null,
          string | null,
        ];
        categories.set(id, { id, slug, title, description, parent_id: parentId, demo_slug: demoSlug ?? null });
        return { rows: [] };
      }

      // --- product_category_assignments ---
      if (sql === "SELECT product_id, category_id FROM product_category_assignments WHERE product_id = $1") {
        return { rows: [...assignments.values()].filter((a) => a.product_id === values[0]) as T[] };
      }
      if (sql === "SELECT product_id, category_id FROM product_category_assignments WHERE category_id = $1") {
        return { rows: [...assignments.values()].filter((a) => a.category_id === values[0]) as T[] };
      }
      if (sql.startsWith("INSERT INTO product_category_assignments")) {
        const [productId, categoryId] = values as [string, string];
        // Real ON CONFLICT (product_id, category_id) DO NOTHING semantics --
        // re-assigning an existing pair is a silent no-op, not a duplicate row.
        assignments.set(`${productId}::${categoryId}`, { product_id: productId, category_id: categoryId });
        return { rows: [] };
      }
      if (sql.startsWith("DELETE FROM product_category_assignments")) {
        const [productId, categoryId] = values as [string, string];
        assignments.delete(`${productId}::${categoryId}`);
        return { rows: [] };
      }

      throw new Error(`FakePool: unrecognized query -- ${sql}`);
    },
  };
}
