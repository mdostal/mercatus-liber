import type { Pool } from "pg";
import type { AvailabilityStatus } from "@mercatus-liber/core";
import type {
  ArtStyle,
  ArtStyleRepository,
  ColorRegion,
  FinishTier,
  FinishTierRepository,
  PaletteColor,
  PaletteRepository,
  PricingAttribute,
  PricingRules,
  PricingRulesRepository,
  ProductCustomization,
  ProductCustomizationRepository,
} from "@mercatus-liber/customization";

/**
 * Self-contained schema for the customization persistence surface -- same
 * "own schema-init, no shared-file edits" pattern as bundles.ts and
 * community-goals.ts. customization is not part of schema.ts's SCHEMA_SQL.
 * See ensureSchema for when it runs.
 *
 * `seq` keeps list() in insertion order, matching the in-memory repositories:
 * palette and art style order is presentation order, and defaultSelection's
 * fallback picks the first active color. An upsert keeps a row's position.
 *
 * Every nested shape (ColorRegion[], PricingAttribute[], ContrastRule[],
 * ExcessUnitRule[], Record<string, number> maps, PaletteColor.hexes)
 * stores as one JSONB column rather than a separate table per shape --
 * same "no real independent query need beyond give-me-this-row's-whole-
 * value" reasoning bundles.ts's own `tiers` column already established.
 * `pricing_rules` is keyed by product_id directly (not its own generated
 * id) -- PricingRulesRepository's own contract is one document per
 * product, confirmed in @mercatus-liber/customization's own doc comments.
 */
const CUSTOMIZATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS palette_colors (
  seq BIGSERIAL,
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hex TEXT NOT NULL,
  kind TEXT,
  hexes JSONB,
  material TEXT,
  status TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS finish_tiers (
  id TEXT PRIMARY KEY,
  rank INTEGER NOT NULL,
  label TEXT NOT NULL,
  colors TEXT NOT NULL,
  description TEXT NOT NULL,
  produces_separate_parts BOOLEAN NOT NULL,
  status TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS art_styles (
  seq BIGSERIAL,
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS product_customizations (
  seq BIGSERIAL,
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  finish_ids JSONB NOT NULL,
  regions JSONB NOT NULL,
  bundled_product_ids JSONB,
  art_style_ids JSONB,
  why TEXT
);
ALTER TABLE product_customizations ADD COLUMN IF NOT EXISTS options JSONB;
ALTER TABLE product_customizations ADD COLUMN IF NOT EXISTS variants JSONB;
CREATE INDEX IF NOT EXISTS idx_product_customizations_product_id ON product_customizations(product_id);

CREATE TABLE IF NOT EXISTS pricing_rules (
  product_id TEXT PRIMARY KEY,
  base_price_cents JSONB NOT NULL,
  attributes JSONB NOT NULL,
  contrast_rules JSONB,
  color_markup_cents JSONB,
  estimated_minutes JSONB,
  excess_unit_rules JSONB
);
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS variant_overrides JSONB;
`;

const schemaByPool = new WeakMap<Pool, Promise<void>>();

/**
 * Runs the schema once per pool, on first use. Five repositories share these
 * tables, and running CREATE TABLE IF NOT EXISTS concurrently can fail with a
 * unique violation on Postgres's catalog. A failed attempt isn't remembered,
 * so a database that was paused or briefly unreachable recovers on the next call.
 */
function ensureSchema(pool: Pool): Promise<void> {
  const existing = schemaByPool.get(pool);
  if (existing) return existing;
  const ready = pool.query(CUSTOMIZATION_SCHEMA_SQL).then(() => undefined);
  schemaByPool.set(pool, ready);
  ready.catch(() => schemaByPool.delete(pool));
  return ready;
}

interface PaletteColorRow {
  id: string;
  label: string;
  hex: string;
  kind: string | null;
  hexes: string[] | null; // JSONB -- already parsed by the pg driver
  material: string | null;
  status: string | null;
  note: string | null;
}

function rowToPaletteColor(row: PaletteColorRow): PaletteColor {
  return {
    id: row.id,
    label: row.label,
    hex: row.hex,
    ...(row.kind ? { kind: row.kind as "solid" | "multi" } : {}),
    ...(row.hexes ? { hexes: row.hexes } : {}),
    ...(row.material ? { material: row.material } : {}),
    ...(row.status ? { status: row.status as AvailabilityStatus } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

/** Real Postgres-backed PaletteRepository -- see this file's header. */
export function createPostgresPaletteRepository(pool: Pool): PaletteRepository {
  return {
    async list(): Promise<PaletteColor[]> {
      await ensureSchema(pool);
      const result = await pool.query<PaletteColorRow>("SELECT * FROM palette_colors ORDER BY seq");
      return result.rows.map(rowToPaletteColor);
    },
    async save(color: PaletteColor): Promise<void> {
      await ensureSchema(pool);
      await pool.query(
        `INSERT INTO palette_colors (id, label, hex, kind, hexes, material, status, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           hex = EXCLUDED.hex,
           kind = EXCLUDED.kind,
           hexes = EXCLUDED.hexes,
           material = EXCLUDED.material,
           status = EXCLUDED.status,
           note = EXCLUDED.note`,
        [color.id, color.label, color.hex, color.kind ?? null, color.hexes ? JSON.stringify(color.hexes) : null, color.material ?? null, color.status ?? null, color.note ?? null],
      );
    },
  };
}

interface FinishTierRow {
  id: string;
  rank: number;
  label: string;
  colors: string;
  description: string;
  produces_separate_parts: boolean;
  status: string | null;
  note: string | null;
}

function rowToFinishTier(row: FinishTierRow): FinishTier {
  return {
    id: row.id,
    rank: row.rank,
    label: row.label,
    colors: row.colors as FinishTier["colors"],
    description: row.description,
    producesSeparateParts: row.produces_separate_parts,
    ...(row.status ? { status: row.status as AvailabilityStatus } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

/** Real Postgres-backed FinishTierRepository -- see this file's header. */
export function createPostgresFinishTierRepository(pool: Pool): FinishTierRepository {
  return {
    async list(): Promise<FinishTier[]> {
      await ensureSchema(pool);
      const result = await pool.query<FinishTierRow>("SELECT * FROM finish_tiers ORDER BY rank, id");
      return result.rows.map(rowToFinishTier);
    },
    async save(tier: FinishTier): Promise<void> {
      await ensureSchema(pool);
      await pool.query(
        `INSERT INTO finish_tiers (id, rank, label, colors, description, produces_separate_parts, status, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           rank = EXCLUDED.rank,
           label = EXCLUDED.label,
           colors = EXCLUDED.colors,
           description = EXCLUDED.description,
           produces_separate_parts = EXCLUDED.produces_separate_parts,
           status = EXCLUDED.status,
           note = EXCLUDED.note`,
        [tier.id, tier.rank, tier.label, tier.colors, tier.description, tier.producesSeparateParts, tier.status ?? null, tier.note ?? null],
      );
    },
  };
}

interface ArtStyleRow {
  id: string;
  label: string;
  description: string;
  status: string | null;
  note: string | null;
}

function rowToArtStyle(row: ArtStyleRow): ArtStyle {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    ...(row.status ? { status: row.status as AvailabilityStatus } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

/** Real Postgres-backed ArtStyleRepository -- see this file's header. */
export function createPostgresArtStyleRepository(pool: Pool): ArtStyleRepository {
  return {
    async list(): Promise<ArtStyle[]> {
      await ensureSchema(pool);
      const result = await pool.query<ArtStyleRow>("SELECT * FROM art_styles ORDER BY seq");
      return result.rows.map(rowToArtStyle);
    },
    async save(style: ArtStyle): Promise<void> {
      await ensureSchema(pool);
      await pool.query(
        `INSERT INTO art_styles (id, label, description, status, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           note = EXCLUDED.note`,
        [style.id, style.label, style.description, style.status ?? null, style.note ?? null],
      );
    },
  };
}

interface ProductCustomizationRow {
  id: string;
  product_id: string;
  finish_ids: string[]; // JSONB
  regions: ColorRegion[]; // JSONB
  bundled_product_ids: string[] | null; // JSONB
  art_style_ids: string[] | null; // JSONB
  why: string | null;
  options: ProductCustomization["options"] | null; // JSONB
  variants: ProductCustomization["variants"] | null; // JSONB
}

function rowToProductCustomization(row: ProductCustomizationRow): ProductCustomization {
  return {
    id: row.id,
    productId: row.product_id,
    finishIds: row.finish_ids,
    regions: row.regions,
    ...(row.bundled_product_ids ? { bundledProductIds: row.bundled_product_ids } : {}),
    ...(row.art_style_ids ? { artStyleIds: row.art_style_ids } : {}),
    ...(row.why ? { why: row.why } : {}),
    ...(row.options ? { options: row.options } : {}),
    ...(row.variants ? { variants: row.variants } : {}),
  };
}

/** Real Postgres-backed ProductCustomizationRepository -- see this file's header. */
export function createPostgresProductCustomizationRepository(pool: Pool): ProductCustomizationRepository {
  return {
    async get(id: string): Promise<ProductCustomization | null> {
      await ensureSchema(pool);
      const result = await pool.query<ProductCustomizationRow>("SELECT * FROM product_customizations WHERE id = $1", [id]);
      return result.rows[0] ? rowToProductCustomization(result.rows[0]) : null;
    },
    async getByProductId(productId: string): Promise<ProductCustomization | null> {
      await ensureSchema(pool);
      const result = await pool.query<ProductCustomizationRow>("SELECT * FROM product_customizations WHERE product_id = $1 ORDER BY seq LIMIT 1", [productId]);
      return result.rows[0] ? rowToProductCustomization(result.rows[0]) : null;
    },
    async list(): Promise<ProductCustomization[]> {
      await ensureSchema(pool);
      const result = await pool.query<ProductCustomizationRow>("SELECT * FROM product_customizations ORDER BY seq");
      return result.rows.map(rowToProductCustomization);
    },
    async save(customization: ProductCustomization): Promise<void> {
      await ensureSchema(pool);
      await pool.query(
        `INSERT INTO product_customizations (id, product_id, finish_ids, regions, bundled_product_ids, art_style_ids, why, options, variants)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           finish_ids = EXCLUDED.finish_ids,
           regions = EXCLUDED.regions,
           bundled_product_ids = EXCLUDED.bundled_product_ids,
           art_style_ids = EXCLUDED.art_style_ids,
           why = EXCLUDED.why,
           options = EXCLUDED.options,
           variants = EXCLUDED.variants`,
        [
          customization.id,
          customization.productId,
          JSON.stringify(customization.finishIds),
          JSON.stringify(customization.regions),
          customization.bundledProductIds ? JSON.stringify(customization.bundledProductIds) : null,
          customization.artStyleIds ? JSON.stringify(customization.artStyleIds) : null,
          customization.why ?? null,
          customization.options ? JSON.stringify(customization.options) : null,
          customization.variants ? JSON.stringify(customization.variants) : null,
        ],
      );
    },
  };
}

interface PricingRulesRow {
  product_id: string;
  base_price_cents: Record<string, number>; // JSONB
  attributes: PricingAttribute[]; // JSONB
  contrast_rules: PricingRules["contrastRules"] | null; // JSONB
  color_markup_cents: Record<string, number> | null; // JSONB
  estimated_minutes: Record<string, number> | null; // JSONB
  excess_unit_rules: PricingRules["excessUnitRules"] | null; // JSONB
  variant_overrides: PricingRules["variantOverrides"] | null; // JSONB
}

function rowToPricingRules(row: PricingRulesRow): PricingRules {
  return {
    basePriceCents: row.base_price_cents,
    attributes: row.attributes,
    ...(row.contrast_rules ? { contrastRules: row.contrast_rules } : {}),
    ...(row.color_markup_cents ? { colorMarkupCents: row.color_markup_cents } : {}),
    ...(row.estimated_minutes ? { estimatedMinutes: row.estimated_minutes } : {}),
    ...(row.excess_unit_rules ? { excessUnitRules: row.excess_unit_rules } : {}),
    ...(row.variant_overrides ? { variantOverrides: row.variant_overrides } : {}),
  };
}

/**
 * Real Postgres-backed PricingRulesRepository -- the durable storage
 * PricingService needed since shipping (see @mercatus-liber/customization's
 * own subsystem doc, "Open questions" -- an admin edit otherwise doesn't
 * survive a restart). Keyed by product_id directly, one row per product,
 * matching PricingRulesRepository's own contract exactly.
 */
export function createPostgresPricingRulesRepository(pool: Pool): PricingRulesRepository {
  return {
    async get(productId: string): Promise<PricingRules | null> {
      await ensureSchema(pool);
      const result = await pool.query<PricingRulesRow>("SELECT * FROM pricing_rules WHERE product_id = $1", [productId]);
      return result.rows[0] ? rowToPricingRules(result.rows[0]) : null;
    },
    async save(productId: string, rules: PricingRules): Promise<void> {
      await ensureSchema(pool);
      await pool.query(
        `INSERT INTO pricing_rules (product_id, base_price_cents, attributes, contrast_rules, color_markup_cents, estimated_minutes, excess_unit_rules, variant_overrides)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (product_id) DO UPDATE SET
           base_price_cents = EXCLUDED.base_price_cents,
           attributes = EXCLUDED.attributes,
           contrast_rules = EXCLUDED.contrast_rules,
           color_markup_cents = EXCLUDED.color_markup_cents,
           estimated_minutes = EXCLUDED.estimated_minutes,
           excess_unit_rules = EXCLUDED.excess_unit_rules,
           variant_overrides = EXCLUDED.variant_overrides`,
        [
          productId,
          JSON.stringify(rules.basePriceCents),
          JSON.stringify(rules.attributes),
          rules.contrastRules ? JSON.stringify(rules.contrastRules) : null,
          rules.colorMarkupCents ? JSON.stringify(rules.colorMarkupCents) : null,
          rules.estimatedMinutes ? JSON.stringify(rules.estimatedMinutes) : null,
          rules.excessUnitRules ? JSON.stringify(rules.excessUnitRules) : null,
          rules.variantOverrides ? JSON.stringify(rules.variantOverrides) : null,
        ],
      );
    },
    async list(): Promise<Record<string, PricingRules>> {
      await ensureSchema(pool);
      const result = await pool.query<PricingRulesRow>("SELECT * FROM pricing_rules");
      const out: Record<string, PricingRules> = {};
      for (const row of result.rows) out[row.product_id] = rowToPricingRules(row);
      return out;
    },
  };
}
