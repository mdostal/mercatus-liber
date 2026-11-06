import type {
  ArtStyle,
  ArtStyleRepository,
  FinishTier,
  FinishTierRepository,
  PaletteColor,
  PaletteRepository,
  PricingRules,
  PricingRulesRepository,
  ProductCustomization,
  ProductCustomizationRepository,
} from "@mercatus-liber/customization";
import type { CollectionLike, DbLike } from "./index.js";

/**
 * The record sits in `value` as a whole rather than as top-level fields,
 * because `$set` can't remove a field: an upsert that drops an optional field
 * would otherwise leave the old value behind. `position` keeps list() in
 * insertion order, since MongoDB doesn't guarantee natural order.
 */
interface RecordDoc<T> {
  _id: string;
  position: number;
  value: T;
  productId?: string;
}

let lastPosition = 0;

/** Increases within a process and across restarts, even for saves in the same millisecond. */
function nextPosition(): number {
  lastPosition = Math.max(Date.now(), lastPosition + 1);
  return lastPosition;
}

function byPosition<T>(a: RecordDoc<T>, b: RecordDoc<T>): number {
  return a.position - b.position || a._id.localeCompare(b._id);
}

async function listInOrder<T>(collection: CollectionLike<RecordDoc<T>>, filter: Record<string, unknown> = {}): Promise<T[]> {
  const docs = await collection.find(filter).toArray();
  return docs.sort(byPosition).map((doc) => doc.value);
}

async function saveRecord<T>(collection: CollectionLike<RecordDoc<T>>, id: string, value: T, extra: { productId?: string } = {}): Promise<void> {
  const existing = await collection.findOne({ _id: id });
  await collection.updateOne({ _id: id }, { $set: { position: existing?.position ?? nextPosition(), value, ...extra } as Partial<RecordDoc<T>> }, { upsert: true });
}

export function createMongoPaletteRepository(db: DbLike): PaletteRepository {
  const collection = db.collection<RecordDoc<PaletteColor>>("palette_colors");
  return {
    list: () => listInOrder(collection),
    save: (color) => saveRecord(collection, color.id, color),
  };
}

export function createMongoFinishTierRepository(db: DbLike): FinishTierRepository {
  const collection = db.collection<RecordDoc<FinishTier>>("finish_tiers");
  return {
    async list(): Promise<FinishTier[]> {
      const tiers = await listInOrder(collection);
      return tiers.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    },
    save: (tier) => saveRecord(collection, tier.id, tier),
  };
}

export function createMongoArtStyleRepository(db: DbLike): ArtStyleRepository {
  const collection = db.collection<RecordDoc<ArtStyle>>("art_styles");
  return {
    list: () => listInOrder(collection),
    save: (style) => saveRecord(collection, style.id, style),
  };
}

export function createMongoProductCustomizationRepository(db: DbLike): ProductCustomizationRepository {
  const collection = db.collection<RecordDoc<ProductCustomization>>("product_customizations");
  let indexReady: Promise<unknown> | undefined;
  const ensureIndex = (): Promise<unknown> => {
    indexReady ??= collection.createIndex({ productId: 1 }).catch((error: unknown) => {
      indexReady = undefined;
      throw error;
    });
    return indexReady;
  };
  return {
    async get(id: string): Promise<ProductCustomization | null> {
      return (await collection.findOne({ _id: id }))?.value ?? null;
    },
    async getByProductId(productId: string): Promise<ProductCustomization | null> {
      await ensureIndex();
      return (await listInOrder(collection, { productId }))[0] ?? null;
    },
    list: () => listInOrder(collection),
    async save(customization: ProductCustomization): Promise<void> {
      await ensureIndex();
      await saveRecord(collection, customization.id, customization, { productId: customization.productId });
    },
  };
}

export function createMongoPricingRulesRepository(db: DbLike): PricingRulesRepository {
  const collection = db.collection<RecordDoc<PricingRules>>("pricing_rules");
  return {
    async get(productId: string): Promise<PricingRules | null> {
      return (await collection.findOne({ _id: productId }))?.value ?? null;
    },
    save: (productId, rules) => saveRecord(collection, productId, rules),
    async list(): Promise<Record<string, PricingRules>> {
      const docs = await collection.find({}).toArray();
      return Object.fromEntries(docs.map((doc) => [doc._id, doc.value]));
    },
  };
}
