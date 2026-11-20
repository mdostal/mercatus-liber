import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { serveMediaFile } from "@mercatus-liber/media";
import { describe, expect, it } from "vitest";
import { createPostgresMediaStore } from "../src/media-store.js";

function poolFor(db: PGlite): Pool {
  const query = async (text: string, values?: unknown[]) => {
    if (values) return db.query(text, values);
    const results = await db.exec(text);
    return results[results.length - 1];
  };
  return { query } as unknown as Pool;
}

describe("Postgres MediaStore", () => {
  it("keeps bytes exactly and serves them with a long cache", { timeout: 30_000 }, async () => {
    const store = createPostgresMediaStore(poolFor(new PGlite()), { baseUrl: "/media/" });
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 1]);
    const { id, url } = await store.put({ bytes, contentType: "image/png", name: "tee front.png" });
    expect(url).toBe(`/media/${id}`);
    const file = (await store.get(id))!;
    expect([...file.bytes]).toEqual([...bytes]);
    expect(file).toMatchObject({ contentType: "image/png", name: "tee front.png" });
    const response = await serveMediaFile(store, id);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="tee-front.png"');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...bytes]);
    expect((await serveMediaFile(store, "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
