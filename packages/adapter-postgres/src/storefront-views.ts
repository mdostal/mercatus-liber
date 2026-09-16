import type { Pool } from "pg";
import type { StorefrontView, StorefrontViewRepository, StorefrontViewStatus } from "@mercatus-liber/storefront-views";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see this file's header context: 12 other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once).
 *
 * `slug` is unique only WITHIN a given demoSlug (see
 * @mercatus-liber/storefront-views' types.ts) -- a compound UNIQUE
 * constraint on (demo_slug, slug), not a bare UNIQUE on slug alone, so two
 * different demos can genuinely reuse the same slug without colliding.
 * `categoryIds` (string[]) has no natural flat-column mapping, so --
 * mirroring this package's own precedent for storing a JS array as JSONB via
 * the `pg` driver (see promotions.ts's `target_sku_ids` column) -- it's
 * stored as a JSONB column, serialized with JSON.stringify on the way in and
 * auto-parsed back into a JS value by the driver on the way out. Everything
 * else is a real flat column.
 */
const STOREFRONT_VIEWS_DDL = `
  CREATE TABLE IF NOT EXISTS storefront_views (
    id TEXT PRIMARY KEY,
    demo_slug TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    hero_headline TEXT NOT NULL,
    hero_subheadline TEXT NOT NULL,
    category_ids JSONB NOT NULL,
    theme_key TEXT,
    is_default_override BOOLEAN NOT NULL,
    starts_at TEXT,
    ends_at TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (demo_slug, slug)
  );
  CREATE INDEX IF NOT EXISTS idx_storefront_views_demo_slug ON storefront_views(demo_slug);
`;

interface StorefrontViewRow {
  id: string;
  demo_slug: string;
  slug: string;
  name: string;
  hero_headline: string;
  hero_subheadline: string;
  category_ids: string[]; // JSONB -- already parsed by the pg driver
  theme_key: string | null;
  is_default_override: boolean;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  created_at: string;
}

function rowToStorefrontView(row: StorefrontViewRow): StorefrontView {
  return {
    id: row.id,
    demoSlug: row.demo_slug,
    slug: row.slug,
    name: row.name,
    heroHeadline: row.hero_headline,
    heroSubheadline: row.hero_subheadline,
    categoryIds: row.category_ids,
    themeKey: row.theme_key,
    isDefaultOverride: row.is_default_override,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status as StorefrontViewStatus,
    createdAt: row.created_at,
  };
}

/**
 * Real Postgres-backed StorefrontViewRepository -- until now
 * @mercatus-liber/storefront-views' StorefrontViewRepository (the
 * StorefrontView entities themselves -- a curated presentation layer over a
 * store's catalog, see this package's own header comment) was in-memory-only
 * regardless of backend, so a published storefront takeover never survived a
 * server restart. `save` is a full upsert (matching the in-memory reference
 * implementation's createInMemoryStorefrontViewRepository exactly): a save
 * with the same id overwrites every field. The service layer
 * (createStorefrontViewsService) owns the actual duplicate-active-slug check
 * in publishView -- this repository just needs to support real
 * getBySlug/listByDemoSlug queries scoped to the compound (demo_slug, slug)
 * key, which it does via the table's UNIQUE (demo_slug, slug) constraint and
 * a real parameterized WHERE.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. `get`/`getBySlug`/`listByDemoSlug`/`save` each
 * await that DDL's completion first, so a repository is safe to use
 * immediately after construction.
 */
export function createPostgresStorefrontViewRepository(pool: Pool): StorefrontViewRepository {
  const ready = pool.query(STOREFRONT_VIEWS_DDL);

  return {
    async get(id: string): Promise<StorefrontView | null> {
      await ready;
      const result = await pool.query<StorefrontViewRow>("SELECT * FROM storefront_views WHERE id = $1", [id]);
      return result.rows[0] ? rowToStorefrontView(result.rows[0]) : null;
    },
    async getBySlug(demoSlug: string, slug: string): Promise<StorefrontView | null> {
      await ready;
      const result = await pool.query<StorefrontViewRow>(
        "SELECT * FROM storefront_views WHERE demo_slug = $1 AND slug = $2",
        [demoSlug, slug],
      );
      return result.rows[0] ? rowToStorefrontView(result.rows[0]) : null;
    },
    async listByDemoSlug(demoSlug: string): Promise<StorefrontView[]> {
      await ready;
      const result = await pool.query<StorefrontViewRow>("SELECT * FROM storefront_views WHERE demo_slug = $1", [
        demoSlug,
      ]);
      return result.rows.map(rowToStorefrontView);
    },
    async save(view: StorefrontView): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO storefront_views (
           id, demo_slug, slug, name, hero_headline, hero_subheadline, category_ids,
           theme_key, is_default_override, starts_at, ends_at, status, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           demo_slug = EXCLUDED.demo_slug,
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           hero_headline = EXCLUDED.hero_headline,
           hero_subheadline = EXCLUDED.hero_subheadline,
           category_ids = EXCLUDED.category_ids,
           theme_key = EXCLUDED.theme_key,
           is_default_override = EXCLUDED.is_default_override,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at`,
        [
          view.id,
          view.demoSlug,
          view.slug,
          view.name,
          view.heroHeadline,
          view.heroSubheadline,
          JSON.stringify(view.categoryIds),
          view.themeKey,
          view.isDefaultOverride,
          view.startsAt,
          view.endsAt,
          view.status,
          view.createdAt,
        ],
      );
    },
  };
}
