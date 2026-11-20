import { randomUUID } from "node:crypto";

/** A stored file, as a store serves it. */
export interface MediaFile {
  id: string;
  contentType: string;
  bytes: Uint8Array;
  /** A name for people, such as "tee-black-front.jpg". */
  name: string;
  createdAt: string;
}

/**
 * Somewhere to keep files a store makes or copies, such as mockup images,
 * and serve them from its own URL. The store's route serves `get(id)` at
 * `urlFor(id)`; files never change, so the route can cache them for a year.
 */
export interface MediaStore {
  put(input: { bytes: Uint8Array; contentType: string; name: string }): Promise<{ id: string; url: string }>;
  get(id: string): Promise<MediaFile | null>;
  urlFor(id: string): string;
}

/** The largest file put/copy accepts: 10 MB. */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** A MediaStore in memory, for tests and local development. `baseUrl` is the route that serves files, e.g. "/media". */
export function createInMemoryMediaStore(options: { baseUrl: string }): MediaStore {
  const files = new Map<string, MediaFile>();
  const base = options.baseUrl.replace(/\/+$/, "");
  return {
    async put({ bytes, contentType, name }) {
      const id = randomUUID();
      files.set(id, { id, contentType, bytes, name, createdAt: new Date().toISOString() });
      return { id, url: `${base}/${id}` };
    },
    async get(id) {
      return files.get(id) ?? null;
    },
    urlFor: (id) => `${base}/${id}`,
  };
}

/**
 * Downloads an image and keeps a copy in the store, for images whose own URL
 * won't last (Printful's mockup URLs are temporary). Only https, only
 * PNG/JPEG/WebP/GIF, at most MEDIA_MAX_BYTES.
 */
export async function copyImageToMediaStore(store: MediaStore, url: string, name: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  if (!/^https:\/\//.test(url)) throw new Error(`Only https images can be copied: ${url}`);
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Couldn't download ${url}: HTTP ${response.status}`);
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) throw new Error(`${url} is not a PNG, JPEG, WebP or GIF image (${contentType || "no content type"}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MEDIA_MAX_BYTES) throw new Error(`${url} is ${bytes.byteLength} bytes, over the ${MEDIA_MAX_BYTES}-byte limit.`);
  return store.put({ bytes, contentType, name });
}

/** Serves a stored file: 404 for an unknown id, otherwise the bytes with a one-year immutable cache. */
export async function serveMediaFile(store: MediaStore, id: string): Promise<Response> {
  const file = /^[0-9a-f-]{36}$/i.test(id) ? await store.get(id) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.bytes as unknown as ConstructorParameters<typeof Response>[0], { headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=31536000, immutable", "Content-Disposition": `inline; filename="${file.name.replace(/[^\w.-]+/g, "-")}"` } });
}
