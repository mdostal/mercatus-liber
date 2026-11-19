import type { PrintLayout } from "./layouts.js";
import type { ArtVersionStore } from "./versions.js";

/**
 * Print-file names: `{artId}-v{n}-{layout}.png`. The name carries everything
 * needed to render the file, and nothing else, so the file can only ever show
 * a version that exists: there is no way to put words of the requester's
 * choosing on the store's domain.
 */
export interface PrintFileNaming {
  /** `/{prefix}/{artId}-v{n}-{layout}.png`. */
  path(artId: string, version: number, layout: string): string;
  /** A file name (the last path segment) split into its parts, or null for anything that is not a print file for a known layout. */
  parse(file: string): { artId: string; version: number; layout: string } | null;
}

const ART_ID = /^[a-z][a-z0-9-]*$/;

export function createPrintFileNaming(options: { prefix: string; layouts: Readonly<Record<string, PrintLayout>> }): PrintFileNaming {
  const prefix = options.prefix.replace(/^\/+|\/+$/g, "");
  // Longest first, so a layout id that ends another one's id can't steal the match.
  const layoutIds = Object.keys(options.layouts).sort((a, b) => b.length - a.length);
  return {
    path(artId, version, layout) {
      if (!ART_ID.test(artId)) throw new Error(`Art id "${artId}" may use only lowercase letters, digits and "-", starting with a letter.`);
      if (!options.layouts[layout]) throw new Error(`Unknown layout "${layout}".`);
      return `/${prefix}/${artId}-v${version}-${layout}.png`;
    },
    parse(file) {
      if (!file.endsWith(".png")) return null;
      const stem = file.slice(0, -4);
      for (const layout of layoutIds) {
        if (!stem.endsWith(`-${layout}`)) continue;
        const m = /^([a-z][a-z0-9-]*?)-v(\d{1,6})$/.exec(stem.slice(0, -(layout.length + 1)));
        if (m) return { artId: m[1]!, version: Number(m[2]), layout };
      }
      return null;
    },
  };
}

/**
 * Draws art at a print file's pixel size and returns a PNG with a transparent
 * background. The renderer is the store's own (the reference store uses
 * next/og's ImageResponse); this package does not draw.
 */
export type ArtRenderer<T> = (copy: T, widthPx: number, heightPx: number) => Promise<Response | Uint8Array | ArrayBuffer>;

/** A year: a version's file never changes. */
export const PRINT_FILE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Serves print files: give it the last path segment, get a Response. 404 for
 * a name that does not parse and for a version that does not exist; the PNG
 * with a one-year immutable cache otherwise. Framework-free, so a Next.js
 * route is `GET = (_req, { params }) => handler((await params).file)`.
 *
 * Rendering is slow the first time (the reference store measured 3.2 s for a
 * 2250 x 2700 file on Vercel), so give the route a generous time limit.
 */
export function createPrintFileHandler<T>(deps: {
  store: Pick<ArtVersionStore<T>, "get">;
  naming: PrintFileNaming;
  layouts: Readonly<Record<string, PrintLayout>>;
  render: ArtRenderer<T>;
}): (file: string) => Promise<Response> {
  return async (file) => {
    const parsed = deps.naming.parse(file);
    const layout = parsed && deps.layouts[parsed.layout];
    if (!parsed || !layout) return new Response("Not found", { status: 404 });
    const version = await deps.store.get(parsed.artId, parsed.version);
    if (!version) return new Response("Not found", { status: 404 });
    const rendered = await deps.render(version.copy, layout.px[0], layout.px[1]);
    // A Uint8Array is a valid body at runtime; DOM's BodyInit typing only accepts one backed by a plain ArrayBuffer.
    const body = (rendered instanceof Response ? rendered.body : rendered) as BodyInit | null;
    return new Response(body, { headers: { "Content-Type": "image/png", "Cache-Control": PRINT_FILE_CACHE_CONTROL } });
  };
}
