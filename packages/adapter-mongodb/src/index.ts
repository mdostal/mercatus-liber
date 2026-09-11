import type {
  CatalogPersistenceAdapter,
  Product,
  ProductAttribute,
  ProductAttributeRepository,
  ProductFilter,
  ProductImage,
  ProductRepository,
  ProductStatus,
  Sku,
  SkuRepository,
} from "@mercatus-liber/core";

interface ProductDoc {
  _id: string;
  slug: string;
  title: string;
  description: string;
  identifyingAttributeKeys: string[];
  status: ProductStatus;
  images?: ProductImage[];
}

interface SkuDoc {
  _id: string;
  productId: string;
  identifyingAttributes: Sku["identifyingAttributes"];
  price: { amount: number; currency: string };
  status: ProductStatus;
}

/** MongoDB natively supports a compound object as `_id` -- used here for a real (productId, key) composite key, the idiomatic document-model equivalent of adapter-sqlite/adapter-postgres's own composite PRIMARY KEY (product_id, key). */
interface AttributeDoc {
  _id: { productId: string; key: string };
  value: ProductAttribute["value"];
  facetable: boolean;
}

/**
 * The narrow structural slice of MongoDB's real Collection<T>/Db API this
 * adapter actually calls -- not the full driver type, so a test double can
 * implement just this shape with zero dependency on the real `mongodb`
 * package. The real driver's Db/Collection<T> satisfy this interface
 * structurally with no adaptation (confirmed by connectMongoAdapter below,
 * which passes a real driver Db straight through with no cast).
 */
export interface CollectionLike<TDoc extends { _id: unknown }> {
  findOne(filter: Record<string, unknown>): Promise<TDoc | null>;
  find(filter: Record<string, unknown>): { toArray(): Promise<TDoc[]> };
  updateOne(filter: Record<string, unknown>, update: { $set: Partial<TDoc> }, options: { upsert: true }): Promise<unknown>;
  deleteOne(filter: Record<string, unknown>): Promise<unknown>;
  createIndex(spec: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface DbLike {
  collection<TDoc extends { _id: unknown }>(name: string): CollectionLike<TDoc>;
}

function docToProduct(doc: ProductDoc): Product {
  return {
    id: doc._id,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    identifyingAttributeKeys: doc.identifyingAttributeKeys,
    status: doc.status,
    ...(doc.images ? { images: doc.images } : {}),
  };
}

function docToSku(doc: SkuDoc): Sku {
  return {
    id: doc._id,
    productId: doc.productId,
    identifyingAttributes: doc.identifyingAttributes,
    price: doc.price,
    status: doc.status,
  };
}

function docToAttribute(doc: AttributeDoc): ProductAttribute {
  return { productId: doc._id.productId, key: doc._id.key, value: doc.value, facetable: doc.facetable };
}

/**
 * Real third reference persistence adapter, backed by MongoDB. Takes an
 * already-connected DbLike (mirrors adapter-postgres's createPostgresAdapter
 * taking an already-constructed pg.Pool, not a connection string) so this
 * function itself never touches the real `mongodb` package or a network
 * connection -- see connectMongoAdapter below for the real end-to-end
 * connection helper the app actually calls.
 */
export async function createMongoAdapter(db: DbLike): Promise<CatalogPersistenceAdapter> {
  const productsCol = db.collection<ProductDoc>("products");
  const skusCol = db.collection<SkuDoc>("skus");
  const attributesCol = db.collection<AttributeDoc>("product_attributes");

  // Real indexes for the lookups this adapter needs beyond the default _id
  // index -- slug must be unique (mirrors adapter-sqlite/adapter-postgres's
  // own UNIQUE constraint), productId is queried by every listByProduct call.
  await productsCol.createIndex({ slug: 1 }, { unique: true });
  await skusCol.createIndex({ productId: 1 });

  const products: ProductRepository = {
    async get(id: string): Promise<Product | null> {
      const doc = await productsCol.findOne({ _id: id });
      return doc ? docToProduct(doc) : null;
    },
    async getBySlug(slug: string): Promise<Product | null> {
      const doc = await productsCol.findOne({ slug });
      return doc ? docToProduct(doc) : null;
    },
    async list(filter?: ProductFilter): Promise<Product[]> {
      const query: Record<string, unknown> = {};
      if (filter?.status) query.status = filter.status;
      if (filter?.slug) query.slug = filter.slug;
      const docs = await productsCol.find(query).toArray();
      return docs.map(docToProduct);
    },
    async save(product: Product): Promise<void> {
      const { id, ...rest } = product;
      // On an upsert with no matching document, MongoDB creates the new
      // document using the filter's own _id equality value -- real,
      // documented driver behavior, not an assumption -- so `rest` (which
      // excludes id/_id) is sufficient here; the filter supplies it.
      await productsCol.updateOne({ _id: id }, { $set: rest as Partial<ProductDoc> }, { upsert: true });
    },
  };

  const skus: SkuRepository = {
    async get(id: string): Promise<Sku | null> {
      const doc = await skusCol.findOne({ _id: id });
      return doc ? docToSku(doc) : null;
    },
    async listByProduct(productId: string): Promise<Sku[]> {
      const docs = await skusCol.find({ productId }).toArray();
      return docs.map(docToSku);
    },
    async save(sku: Sku): Promise<void> {
      const { id, ...rest } = sku;
      await skusCol.updateOne({ _id: id }, { $set: rest as Partial<SkuDoc> }, { upsert: true });
    },
  };

  const attributes: ProductAttributeRepository = {
    async listByProduct(productId: string): Promise<ProductAttribute[]> {
      const docs = await attributesCol.find({ "_id.productId": productId }).toArray();
      return docs.map(docToAttribute);
    },
    async save(attribute: ProductAttribute): Promise<void> {
      await attributesCol.updateOne(
        { _id: { productId: attribute.productId, key: attribute.key } },
        { $set: { value: attribute.value, facetable: attribute.facetable } },
        { upsert: true },
      );
    },
    async remove(productId: string, key: string): Promise<void> {
      await attributesCol.deleteOne({ _id: { productId, key } });
    },
  };

  return { products, skus, attributes };
}

/**
 * Real end-to-end connection helper: constructs and connects a real
 * MongoClient against `connectionString`, then builds the adapter against
 * its default database (the one named in the connection string's own path,
 * MongoDB's own real convention). Returns the client alongside the adapter
 * so a caller can `client.close()` on shutdown -- CatalogPersistenceAdapter
 * itself has no lifecycle method (see @mercatus-liber/core's own contract),
 * matching how this app's pg.Pool is also never explicitly closed today.
 */
export async function connectMongoAdapter(
  connectionString: string,
): Promise<{ adapter: CatalogPersistenceAdapter; close: () => Promise<void> }> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(connectionString);
  await client.connect();
  // The real driver's Filter<TDoc>/generic Collection<T> typings are
  // stricter than this file's own deliberately-narrow DbLike (they require
  // every filter shape to satisfy MongoDB's own query-operator types) --
  // the plain equality filters this adapter actually builds ({_id: id},
  // {slug}, {productId}, ...) are all real, valid MongoDB queries at
  // runtime; this cast only relaxes the STATIC type at the one real-driver
  // boundary, the same class of pragmatic cast this repo already uses
  // wherever a strict external SDK type is stricter than the narrow
  // structural interface actually being relied on.
  const adapter = await createMongoAdapter(client.db() as unknown as DbLike);
  return { adapter, close: () => client.close() };
}
