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
import type { Category, CategoryRepository, ProductCategoryRepository } from "@mercatus-liber/marketing-catalog";

interface ProductDoc {
  externalId: string;
  slug: string;
  title: string;
  description: string;
  identifyingAttributeKeys: string[];
  status: ProductStatus;
  images?: ProductImage[];
}

interface SkuDoc {
  externalId: string;
  productId: string;
  identifyingAttributes: Sku["identifyingAttributes"];
  priceAmount: number;
  priceCurrency: string;
  status: ProductStatus;
}

interface AttributeDoc {
  productId: string;
  key: string;
  value: ProductAttribute["value"];
  facetable: boolean;
}

interface CategoryDoc {
  externalId: string;
  slug: string;
  title: string;
  description: string;
  parentId: string | null;
}

/**
 * The narrow contract this adapter actually needs from a Convex client --
 * plain string function names ("products:get", Convex's own real
 * `<file>:<export>` convention), not the real `ConvexHttpClient`'s
 * FunctionReference-typed methods. Keeping this boundary narrow (a) makes
 * the adapter trivially testable with a fake double with zero dependency
 * on the real `convex` package, and (b) matches every other adapter in
 * this repo's own "structural interface at the SDK boundary" convention.
 * See connectConvexAdapter below for where this gets bridged to the real
 * ConvexHttpClient via makeFunctionReference.
 */
export interface ConvexClientLike {
  query(functionName: string, args: Record<string, unknown>): Promise<unknown>;
  mutation(functionName: string, args: Record<string, unknown>): Promise<unknown>;
}

function docToProduct(doc: ProductDoc): Product {
  return {
    id: doc.externalId,
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
    id: doc.externalId,
    productId: doc.productId,
    identifyingAttributes: doc.identifyingAttributes,
    price: { amount: doc.priceAmount, currency: doc.priceCurrency },
    status: doc.status,
  };
}

function docToAttribute(doc: AttributeDoc): ProductAttribute {
  return { productId: doc.productId, key: doc.key, value: doc.value, facetable: doc.facetable };
}

function docToCategory(doc: CategoryDoc): Category {
  return {
    id: doc.externalId,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    parentId: doc.parentId,
  };
}

/**
 * Real fourth reference persistence adapter, backed by Convex -- calls the
 * real query/mutation functions shipped in this package's own
 * convex-functions/ directory (copy them into your own Convex project and
 * deploy, see that directory's README.md; this client has nothing to call
 * until you do). Every method below is a thin, honest mapping onto exactly
 * those 4 files' exported functions -- get/getBySlug/list/save on
 * "products", get/listByProduct/save on "skus", listByProduct/save/remove
 * on "attributes" -- nothing here invents a Convex capability those real
 * function files don't actually implement.
 */
export async function createConvexAdapter(client: ConvexClientLike): Promise<CatalogPersistenceAdapter> {
  const products: ProductRepository = {
    async get(id: string): Promise<Product | null> {
      const doc = (await client.query("products:get", { externalId: id })) as ProductDoc | null;
      return doc ? docToProduct(doc) : null;
    },
    async getBySlug(slug: string): Promise<Product | null> {
      const doc = (await client.query("products:getBySlug", { slug })) as ProductDoc | null;
      return doc ? docToProduct(doc) : null;
    },
    async list(filter?: ProductFilter): Promise<Product[]> {
      const docs = (await client.query("products:list", {
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.slug ? { slug: filter.slug } : {}),
      })) as ProductDoc[];
      return docs.map(docToProduct);
    },
    async save(product: Product): Promise<void> {
      const { id, ...rest } = product;
      await client.mutation("products:save", { externalId: id, ...rest });
    },
  };

  const skus: SkuRepository = {
    async get(id: string): Promise<Sku | null> {
      const doc = (await client.query("skus:get", { externalId: id })) as SkuDoc | null;
      return doc ? docToSku(doc) : null;
    },
    async listByProduct(productId: string): Promise<Sku[]> {
      const docs = (await client.query("skus:listByProduct", { productId })) as SkuDoc[];
      return docs.map(docToSku);
    },
    async save(sku: Sku): Promise<void> {
      const { id, price, ...rest } = sku;
      await client.mutation("skus:save", {
        externalId: id,
        priceAmount: price.amount,
        priceCurrency: price.currency,
        ...rest,
      });
    },
  };

  const attributes: ProductAttributeRepository = {
    async listByProduct(productId: string): Promise<ProductAttribute[]> {
      const docs = (await client.query("attributes:listByProduct", { productId })) as AttributeDoc[];
      return docs.map(docToAttribute);
    },
    async save(attribute: ProductAttribute): Promise<void> {
      await client.mutation("attributes:save", { ...attribute });
    },
    async remove(productId: string, key: string): Promise<void> {
      await client.mutation("attributes:remove", { productId, key });
    },
  };

  return { products, skus, attributes };
}

/**
 * Real Convex-backed CategoryRepository -- calls this package's own
 * convex-functions/categories.ts (get/getBySlug/list/save), the same
 * externalId-mapping pattern as products/skus above. See
 * @mercatus-liber/marketing-catalog's in-memory-repository.ts for the
 * reference behavior this must match byte-for-byte.
 */
export function createConvexCategoryRepository(client: ConvexClientLike): CategoryRepository {
  return {
    async get(id: string): Promise<Category | null> {
      const doc = (await client.query("categories:get", { externalId: id })) as CategoryDoc | null;
      return doc ? docToCategory(doc) : null;
    },
    async getBySlug(slug: string): Promise<Category | null> {
      const doc = (await client.query("categories:getBySlug", { slug })) as CategoryDoc | null;
      return doc ? docToCategory(doc) : null;
    },
    async list(): Promise<Category[]> {
      const docs = (await client.query("categories:list", {})) as CategoryDoc[];
      return docs.map(docToCategory);
    },
    async save(category: Category): Promise<void> {
      const { id, ...rest } = category;
      await client.mutation("categories:save", { externalId: id, ...rest });
    },
  };
}

/**
 * Real Convex-backed ProductCategoryRepository -- calls this package's own
 * convex-functions/productCategories.ts. productId/categoryId are this
 * framework's own real ids already (never Convex's internal `_id`), so
 * unlike products/skus/categories above there is no externalId mapping to
 * do here.
 */
export function createConvexProductCategoryRepository(client: ConvexClientLike): ProductCategoryRepository {
  return {
    async listCategoryIdsForProduct(productId: string): Promise<string[]> {
      return (await client.query("productCategories:listCategoryIdsForProduct", { productId })) as string[];
    },
    async listProductIdsInCategory(categoryId: string): Promise<string[]> {
      return (await client.query("productCategories:listProductIdsInCategory", { categoryId })) as string[];
    },
    async assign(productId: string, categoryId: string): Promise<void> {
      await client.mutation("productCategories:assign", { productId, categoryId });
    },
    async unassign(productId: string, categoryId: string): Promise<void> {
      await client.mutation("productCategories:unassign", { productId, categoryId });
    },
  };
}

/**
 * Real end-to-end connection helper shared by every `connectConvex*`
 * function below: constructs the real ConvexHttpClient against `convexUrl`
 * (a deployment's real HTTP API URL, e.g.
 * `https://<deployment-name>.convex.cloud`), bridging its
 * FunctionReference-typed query/mutation methods to this adapter's plain
 * string-name ConvexClientLike contract via `makeFunctionReference` --
 * Convex's own real, documented mechanism for calling functions by name
 * without generated codegen (confirmed via research: `convex/server`'s
 * `makeFunctionReference<"query"|"mutation">(name)`, used exactly this way
 * by applications that don't run `npx convex dev`'s codegen step against
 * this specific calling repo).
 */
async function connectConvexClient(convexUrl: string): Promise<ConvexClientLike> {
  const { ConvexHttpClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  const real = new ConvexHttpClient(convexUrl);

  return {
    query: (name, args) => real.query(makeFunctionReference<"query">(name) as never, args as never),
    mutation: (name, args) => real.mutation(makeFunctionReference<"mutation">(name) as never, args as never),
  };
}

export async function connectConvexAdapter(convexUrl: string): Promise<CatalogPersistenceAdapter> {
  return createConvexAdapter(await connectConvexClient(convexUrl));
}

export async function connectConvexCategoryRepository(convexUrl: string): Promise<CategoryRepository> {
  return createConvexCategoryRepository(await connectConvexClient(convexUrl));
}

export async function connectConvexProductCategoryRepository(convexUrl: string): Promise<ProductCategoryRepository> {
  return createConvexProductCategoryRepository(await connectConvexClient(convexUrl));
}
