import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { MediaFile, MediaStore } from "@mercatus-liber/media";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS media_files (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  name TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

interface Row {
  id: string;
  content_type: string;
  name: string;
  bytes: Buffer;
  created_at: Date;
}

/**
 * Postgres-backed MediaStore: files in a `media_files` table, for a store
 * with no file storage service. Fine for mockups and a few hundred images;
 * a store with many large files should use object storage instead.
 */
export function createPostgresMediaStore(pool: Pool, options: { baseUrl: string }): MediaStore {
  const base = options.baseUrl.replace(/\/+$/, "");
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool.query(SCHEMA_SQL).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  return {
    async put({ bytes, contentType, name }) {
      await ensure();
      const id = randomUUID();
      await pool.query("INSERT INTO media_files (id, content_type, name, bytes) VALUES ($1, $2, $3, $4)", [id, contentType, name, Buffer.from(bytes)]);
      return { id, url: `${base}/${id}` };
    },
    async get(id): Promise<MediaFile | null> {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM media_files WHERE id = $1", [id]);
      const row = rows[0];
      return row ? { id: row.id, contentType: row.content_type, name: row.name, bytes: new Uint8Array(row.bytes), createdAt: row.created_at.toISOString() } : null;
    },
    urlFor: (id) => `${base}/${id}`,
  };
}
