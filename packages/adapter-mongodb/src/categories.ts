import type { Category, CategoryRepository, ProductCategoryRepository } from "@mercatus-liber/marketing-catalog";
import type { DbLike } from "./index.js";

interface CategoryDoc {
  _id: string;
  slug: string;
  title: string;
  description: string;
  parentId: string | null;
}

/**
 * MongoDB natively supports a compound object as `_id` -- used here for a
 * real (productId, categoryId) composite key, the exact same idiom
 * index.ts's own AttributeDoc uses for (productId, key): natural
 * uniqueness plus idempotent upsert-by-_id / delete-by-_id, with no
 * separate uniqueness constraint or index to maintain by hand.
 *
 * `assignedAt` is a small real addition beyond the bare compound key: the
 * real MongoDB wire protocol rejects (or at best treats as an undocumented
 * no-op, depending on driver/server version) an `updateOne` whose `$set` is
 * an empty object, which a bare `{ _id }`-only document would require for
 * `assign`'s upsert. Recording the assignment timestamp gives `$set` a real
 * field to write on every assign (including a repeat assign, which simply
 * refreshes it -- still fully idempotent from ProductCategoryRepository's
 * point of view, since only `_id` is ever read back) without smuggling
 * anything into the public ProductCategoryRepository contract, which never
 * reads this field.
 */
interface ProductCategoryAssignmentDoc {
  _id: { productId: string; categoryId: string };
  assignedAt: number;
}

function docToCategory(doc: CategoryDoc): Category {
  return { id: doc._id, slug: doc.slug, title: doc.title, description: doc.description, parentId: doc.parentId };
}

/**
 * Real MongoDB-backed CategoryRepository (marketing-catalog's own contract,
 * unmodified) -- mirrors createMongoAdapter's `products` repository in
 * index.ts exactly: `_id` is the app-level Category.id directly (Mongo's
 * `_id` can be any app id, same as products/skus already do), with a real
 * unique index on `slug` for getBySlug + to give this document store the
 * same uniqueness adapter-sqlite/adapter-postgres get from a UNIQUE
 * constraint. Async (unlike createMongoProductCategoryRepository below) only
 * because it awaits that index creation before returning, exactly like
 * createMongoAdapter awaits its own createIndex calls before returning.
 */
export async function createMongoCategoryRepository(db: DbLike): Promise<CategoryRepository> {
  const categoriesCol = db.collection<CategoryDoc>("categories");
  await categoriesCol.createIndex({ slug: 1 }, { unique: true });

  return {
    async get(id: string): Promise<Category | null> {
      const doc = await categoriesCol.findOne({ _id: id });
      return doc ? docToCategory(doc) : null;
    },
    async getBySlug(slug: string): Promise<Category | null> {
      const doc = await categoriesCol.findOne({ slug });
      return doc ? docToCategory(doc) : null;
    },
    async list(): Promise<Category[]> {
      const docs = await categoriesCol.find({}).toArray();
      return docs.map(docToCategory);
    },
    async save(category: Category): Promise<void> {
      const { id, ...rest } = category;
      // Same real upsert-by-_id behavior as products/skus/attributes above:
      // on no match, MongoDB creates the new document using the filter's
      // own _id equality value, so `rest` (which excludes id/_id) is
      // sufficient here.
      await categoriesCol.updateOne({ _id: id }, { $set: rest as Partial<CategoryDoc> }, { upsert: true });
    },
  };
}

/**
 * Real MongoDB-backed ProductCategoryRepository for the many-to-many
 * product<->category assignment (marketing-catalog's own contract,
 * unmodified) -- mirrors createMongoAdapter's `attributes` repository in
 * index.ts exactly: a compound object `_id` ({productId, categoryId}) makes
 * `assign` an idempotent upsert-by-_id (assigning the same pair twice never
 * duplicates) and `unassign` a plain delete-by-_id. No additional index
 * beyond the default `_id` index -- same as the existing product_attributes
 * collection's own "_id.productId" queries, which also rely on none.
 */
export function createMongoProductCategoryRepository(db: DbLike): ProductCategoryRepository {
  const assignmentsCol = db.collection<ProductCategoryAssignmentDoc>("product_category_assignments");

  return {
    async listCategoryIdsForProduct(productId: string): Promise<string[]> {
      const docs = await assignmentsCol.find({ "_id.productId": productId }).toArray();
      return docs.map((doc) => doc._id.categoryId);
    },
    async listProductIdsInCategory(categoryId: string): Promise<string[]> {
      const docs = await assignmentsCol.find({ "_id.categoryId": categoryId }).toArray();
      return docs.map((doc) => doc._id.productId);
    },
    async assign(productId: string, categoryId: string): Promise<void> {
      await assignmentsCol.updateOne({ _id: { productId, categoryId } }, { $set: { assignedAt: Date.now() } }, { upsert: true });
    },
    async unassign(productId: string, categoryId: string): Promise<void> {
      await assignmentsCol.deleteOne({ _id: { productId, categoryId } });
    },
  };
}
