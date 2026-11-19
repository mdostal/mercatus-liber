import type { Pool } from "pg";
import { ArtVersionTakenError, type ArtVersion, type SavedArtVersionRepository } from "@mercatus-liber/print-art";

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Postgres-backed SavedArtVersionRepository: print-art versions saved from an
 * editor. Primary key (art_id, version), so a second save of the same number
 * fails and the store retries it with the next one. The table is created on
 * first use. `table` defaults to `print_art_versions` and `idColumn` to
 * `art_id`; pass others to keep using a table a store already has, such as
 * shop.mdostal.com's `back_print_versions` keyed by `back_id`.
 */
export function createPostgresSavedArtVersionRepository<T>(pool: Pool, options: { table?: string; idColumn?: string } = {}): SavedArtVersionRepository<T> {
  const table = options.table ?? "print_art_versions";
  const idColumn = options.idColumn ?? "art_id";
  for (const name of [table, idColumn]) {
    if (!IDENTIFIER.test(name)) throw new Error(`"${name}" may use only lowercase letters, digits and "_".`);
  }
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${table} (
          ${idColumn} TEXT NOT NULL,
          version INTEGER NOT NULL,
          copy JSONB NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (${idColumn}, version)
        )`,
      )
      .catch((error: unknown) => {
        ready = undefined;
        throw error;
      });
    return ready;
  };
  return {
    async list(artId) {
      await ensure();
      const { rows } = await pool.query<{ version: number; copy: T | string; note: string }>(
        `SELECT version, copy, note FROM ${table} WHERE ${idColumn} = $1 ORDER BY version`,
        [artId],
      );
      return rows.map((row): ArtVersion<T> => ({
        version: Number(row.version),
        copy: typeof row.copy === "string" ? (JSON.parse(row.copy) as T) : row.copy,
        note: row.note,
      }));
    },
    async insert(artId, version) {
      await ensure();
      try {
        await pool.query(`INSERT INTO ${table} (${idColumn}, version, copy, note) VALUES ($1, $2, $3, $4)`, [
          artId,
          version.version,
          JSON.stringify(version.copy),
          version.note,
        ]);
      } catch (error) {
        if ((error as { code?: string } | null)?.code === "23505") throw new ArtVersionTakenError(artId, version.version);
        throw error;
      }
    },
  };
}
