import type Database from "better-sqlite3";
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

/**
 * Each record is one JSON document, since nothing queries inside it beyond the
 * columns here. `seq` keeps list() in insertion order, and an upsert keeps a
 * row's `seq`. Finish tiers list by rank, matching every other backend.
 */
const CUSTOMIZATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS palette_colors (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS finish_tiers (id TEXT PRIMARY KEY, rank INTEGER NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS art_styles (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS product_customizations (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, product_id TEXT NOT NULL, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_product_customizations_product_id ON product_customizations(product_id);
CREATE TABLE IF NOT EXISTS pricing_rules (product_id TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

interface ValueRow {
  value: string;
}

function parseAll<T>(rows: unknown[]): T[] {
  return (rows as ValueRow[]).map((row) => JSON.parse(row.value) as T);
}

function parseOne<T>(row: unknown): T | null {
  return row ? (JSON.parse((row as ValueRow).value) as T) : null;
}

export function createSqlitePaletteRepository(db: Database.Database): PaletteRepository {
  db.exec(CUSTOMIZATION_SCHEMA_SQL);
  return {
    async list(): Promise<PaletteColor[]> {
      return parseAll(db.prepare("SELECT value FROM palette_colors ORDER BY seq").all());
    },
    async save(color: PaletteColor): Promise<void> {
      db.prepare("INSERT INTO palette_colors (id, value) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value").run(color.id, JSON.stringify(color));
    },
  };
}

export function createSqliteFinishTierRepository(db: Database.Database): FinishTierRepository {
  db.exec(CUSTOMIZATION_SCHEMA_SQL);
  return {
    async list(): Promise<FinishTier[]> {
      return parseAll(db.prepare("SELECT value FROM finish_tiers ORDER BY rank, id").all());
    },
    async save(tier: FinishTier): Promise<void> {
      db.prepare("INSERT INTO finish_tiers (id, rank, value) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET rank = excluded.rank, value = excluded.value").run(tier.id, tier.rank, JSON.stringify(tier));
    },
  };
}

export function createSqliteArtStyleRepository(db: Database.Database): ArtStyleRepository {
  db.exec(CUSTOMIZATION_SCHEMA_SQL);
  return {
    async list(): Promise<ArtStyle[]> {
      return parseAll(db.prepare("SELECT value FROM art_styles ORDER BY seq").all());
    },
    async save(style: ArtStyle): Promise<void> {
      db.prepare("INSERT INTO art_styles (id, value) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value").run(style.id, JSON.stringify(style));
    },
  };
}

export function createSqliteProductCustomizationRepository(db: Database.Database): ProductCustomizationRepository {
  db.exec(CUSTOMIZATION_SCHEMA_SQL);
  return {
    async get(id: string): Promise<ProductCustomization | null> {
      return parseOne(db.prepare("SELECT value FROM product_customizations WHERE id = ?").get(id));
    },
    async getByProductId(productId: string): Promise<ProductCustomization | null> {
      return parseOne(db.prepare("SELECT value FROM product_customizations WHERE product_id = ? ORDER BY seq LIMIT 1").get(productId));
    },
    async list(): Promise<ProductCustomization[]> {
      return parseAll(db.prepare("SELECT value FROM product_customizations ORDER BY seq").all());
    },
    async save(customization: ProductCustomization): Promise<void> {
      db.prepare("INSERT INTO product_customizations (id, product_id, value) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET product_id = excluded.product_id, value = excluded.value").run(customization.id, customization.productId, JSON.stringify(customization));
    },
  };
}

export function createSqlitePricingRulesRepository(db: Database.Database): PricingRulesRepository {
  db.exec(CUSTOMIZATION_SCHEMA_SQL);
  return {
    async get(productId: string): Promise<PricingRules | null> {
      return parseOne(db.prepare("SELECT value FROM pricing_rules WHERE product_id = ?").get(productId));
    },
    async save(productId: string, rules: PricingRules): Promise<void> {
      db.prepare("INSERT INTO pricing_rules (product_id, value) VALUES (?, ?) ON CONFLICT (product_id) DO UPDATE SET value = excluded.value").run(productId, JSON.stringify(rules));
    },
    async list(): Promise<Record<string, PricingRules>> {
      const rows = db.prepare("SELECT product_id, value FROM pricing_rules").all() as { product_id: string; value: string }[];
      return Object.fromEntries(rows.map((row) => [row.product_id, JSON.parse(row.value) as PricingRules]));
    },
  };
}
