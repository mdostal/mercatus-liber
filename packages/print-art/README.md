# @mercatus-liber/print-art

Versioned custom print art for print-on-demand stores: the words and choices on a shirt back or a sticker sheet, kept as numbered versions that never change once they exist.

**Status:** extracted from shop.mdostal.com's back-print studio (2026-11-19). A Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Why versions

- An order keeps printing exactly the art it was bought with.
- Print providers (Printful, for one) cache files by URL, so a URL must always show the same image.
- An editor can try new copy without changing what the store sells: only a pin in code puts a version on sale.

## Usage

```ts
import {
  createArtVersionStore,
  createPrintFileHandler,
  createPrintFileNaming,
  layoutsAtDpi,
  parseArtRef,
  resolveArtVersion,
} from "@mercatus-liber/print-art";
import { createPostgresSavedArtVersionRepository } from "@mercatus-liber/adapter-postgres";

type BackCopy = { headline: string; url: string };

// Versions in code: every environment can render these.
const CODE_VERSIONS = { card: [{ version: 1, copy: { headline: "Tech help", url: "example.com" }, note: "launch copy" }] };
// What the store sells. Moving a pin is a reviewed code change.
const PINS = { card: 1 };

const store = createArtVersionStore<BackCopy>({
  codeVersions: CODE_VERSIONS,
  saved: createPostgresSavedArtVersionRepository(pool), // editor-saved versions, numbered after the code's
});

const layouts = layoutsAtDpi({ "back-15x18": [15, 18], "back-12x16": [12, 16] }, 150);
const naming = createPrintFileNaming({ prefix: "print-files/backs", layouts });

// A store product prints the pinned version; a sample may name any version: "card@v3".
const version = resolveArtVersion(parseArtRef("card@v3"), PINS, { allowUnpinned: true });
const fileUrl = `https://shop.example.com${naming.path("card", version!, "back-15x18")}`;

// app/print-files/backs/[file]/route.ts (Next.js)
const handler = createPrintFileHandler({ store, naming, layouts, render: renderBackPrint });
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  return handler((await params).file);
}
```

## Layouts from a provider's print areas

`layoutsFromPrintAreas(areas, { technique? })` builds layouts from a provider's print areas (adapter-printful's `getPrintAreas`), so print files are drawn at exactly the size the provider wants: Printful product 71's front, 12 x 16 in at 150 dpi, becomes layout `front` at 1800 x 2400 px. Placement keys become file-name-safe ids (`sleeve_left` becomes `sleeve-left`) and each layout keeps its `placement`.

## Key exports

- `createArtVersionStore({ codeVersions, saved?, validate? })`: `list`, `get`, `save`, `isKnownArt`. Code versions come first; saved ones are numbered after. Saving retries once when another save took the number. Only art ids with code versions can be saved to.
- `SavedArtVersionRepository` and `createInMemorySavedArtVersionRepository()`. A repository's `insert` throws `ArtVersionTakenError` for a number that is already used.
- `overlongFields(copy, limits)`: string fields over their length limit, for an editor or `validate`.
- `parseArtRef("card@v2")`, `formatArtRef`, `resolveArtVersion(ref, pins, { allowUnpinned })`, `invalidPins(pins, codeVersions)` (worth a test in your store).
- `layoutsAtDpi(inchesById, dpi)` and `PrintLayout`.
- `printCoverage(garment, printInches, topInches = 3)`: percent of the garment's flat width and length a print covers, and whether it fits.
- `createPrintFileNaming({ prefix, layouts })`: `path` and `parse` for `{artId}-v{n}-{layout}.png`.
- `createPrintFileHandler({ store, naming, layouts, render })`: file name in, `Response` out. 404 for anything that is not an existing version in a known layout; otherwise the PNG with `Cache-Control: public, max-age=31536000, immutable`.

## Rendering

This package does not draw. The store passes `render(copy, widthPx, heightPx)`, returning a transparent PNG at the print file's pixels. shop.mdostal.com uses next/og's `ImageResponse` (Satori and Resvg). What it learned:

- Satori needs `display: flex` on every box with more than one child. It has no grid and no `font-stretch`. Ship static `.woff` or `.ttf` faces.
- Set `boxSizing: "border-box"` on the root, or a browser preview of the same JSX overflows.
- On Vercel, files read from `public/` at runtime need `outputFileTracingIncludes` for the route.
- A first render of a 2250 x 2700 file took 3.2 s in production (0.27 s once warm). Give the route a generous `maxDuration`.
- Printful prints one technique per item: a DTF back needs a DTF front.
