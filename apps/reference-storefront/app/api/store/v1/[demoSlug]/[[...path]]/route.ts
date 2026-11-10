import { DEMO_CATALOG_SLUG, isDemoSlug } from "../../../../../../lib/demos";
import { getServicesForDemo } from "../../../../../../lib/services";
import { resolveStoreImage, scopeCatalogToStore } from "../../../../../../lib/store-api";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const notFound = (message: string): Response => Response.json({ error: { code: "not_found", message } }, { status: 404 });

/**
 * A product photo, served from the store's own host. Public like the photo on
 * the product page, so an app that imported the product can show and post it
 * without the API key. Only images of this store's products resolve.
 */
async function serveImage(demoSlug: Parameters<typeof getServicesForDemo>[0], path: string[]): Promise<Response> {
  const [, productId, owner, index] = path;
  const { catalog } = await getServicesForDemo(demoSlug);
  const source = await resolveStoreImage(scopeCatalogToStore(catalog, DEMO_CATALOG_SLUG[demoSlug]), productId!, owner!, Number(index));
  if (!source || !source.startsWith("https://")) return notFound("No such image.");
  let upstream: Response;
  try {
    upstream = await fetch(source, { signal: AbortSignal.timeout(10_000) });
  } catch {
    return Response.json({ error: { code: "image_unavailable", message: "The image couldn't be loaded." } }, { status: 502 });
  }
  const type = upstream.headers.get("content-type") ?? "";
  const declared = Number(upstream.headers.get("content-length") ?? 0);
  if (!upstream.ok || !type.startsWith("image/") || declared > MAX_IMAGE_BYTES) {
    await upstream.body?.cancel().catch(() => {});
    return Response.json({ error: { code: "image_unavailable", message: "The image couldn't be loaded." } }, { status: 502 });
  }
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return Response.json({ error: { code: "image_unavailable", message: "The image couldn't be loaded." } }, { status: 502 });
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": type, "cache-control": "public, max-age=86400, s-maxage=604800", "x-content-type-options": "nosniff" },
  });
}

/** The store API for outside apps such as flayr. See @mercatus-liber/store-api and docs/integrations/flayr.md. */
async function handle(request: Request, { params }: { params: Promise<{ demoSlug: string; path?: string[] }> }): Promise<Response> {
  const { demoSlug, path = [] } = await params;
  if (!isDemoSlug(demoSlug)) return notFound("No such store.");
  if (request.method === "GET" && path[0] === "images" && path.length === 4) return serveImage(demoSlug, path);
  const { storeApi } = await getServicesForDemo(demoSlug);
  return storeApi(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
