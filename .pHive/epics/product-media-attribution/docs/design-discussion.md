# Design discussion: product media (3D viewer, video) + license/attribution

## 1. Goal

Filed as mercatus-liber#2 by a consumer app (shop.mdostal.com), building a
3D-print product line: nothing in this framework lets a `Product` carry a
3D-model-viewer URL, a demo/teardown video, or a license/attribution line.
Confirmed by direct source read (not assumed) -- `Product`
(`packages/core/src/schema.ts`) has exactly one media field, `images?`; no
video/3D/license concept anywhere in catalog, media, or CMS (CMS's
component `kind` enum is closed, no `video`/`embed` kind).

This epic adds the real fix suggested in that issue, scoped to what's
actually asked for -- not folding `images` into a bigger unified "media"
union (that would be a breaking change to every existing `images` caller,
unjustified by this ask).

## 2. Approach -- mirrors the image-cdn epic's own precedent exactly

Three new, additive, optional `Product` fields, same shape discipline as
`images?` (absent for every pre-existing row/caller -- zero regression):

```ts
interface ProductVideo {
  url: string;
  /** Required, not optional -- same "no honest default" reasoning as ProductImage.alt. */
  title: string;
}

interface Product {
  // ...existing fields unchanged...
  images?: ProductImage[];
  /** New. A demo/teardown video is naturally one-or-more, same cardinality as images. */
  videos?: ProductVideo[];
  /**
   * New. A single canonical 3D-model-viewer URL for this product -- a raw
   * source reference (a .glb/.gltf file, or any iframe-embeddable viewer
   * URL), same "schema doesn't bake in a provider's delivery shape"
   * discipline ProductImage.url's own doc comment already states. Singular
   * (not an array like images/videos) -- one product, one canonical 3D
   * model; nothing asked for multiple.
   */
  viewerUrl?: string;
  /** New. Free-text license/attribution line (e.g. "Self-modeled, owned -- OSS/CC-BY", "MakerWorld, personal use only"). */
  license?: string;
}
```

**Touched exactly where `images?` was touched** (confirmed via
`grep -rl "image-cdn epic"`), same files, same pattern, nothing extra:

- `packages/core/src/schema.ts` -- the three fields + `ProductVideo`.
- `packages/catalog/src/service.ts` -- `NewProductInput`/`UpdateProductInput`
  grow the same three optional fields; `createProduct` spreads them in with
  the same `...(input.X ? { X: input.X } : {})` idiom; `updateProduct`
  needs no change at all -- its `{ ...existing, ...patch }` spread already
  handles any new optional field for free.
- `packages/adapter-sqlite/src/index.ts` + `schema.ts` -- three new nullable
  columns (`videos TEXT` JSON-encoded, `viewer_url TEXT`, `license TEXT`),
  same defensive best-effort `ALTER TABLE ... ADD COLUMN` + try/catch
  fallback as `openSqliteDb`'s existing `images` migration, for a
  pre-existing file-backed DB.
- `packages/adapter-postgres/src/index.ts` + `schema.ts` -- three new
  columns (`videos JSONB`, `viewer_url TEXT`, `license TEXT`), same
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idempotent statement Postgres
  supports natively (no try/catch needed, unlike sqlite).
- New migration-safety tests, mirroring
  `packages/adapter-sqlite/test/images-migration.test.ts` exactly (build a
  real pre-existing DB file by hand with the old schema, open it through the
  adapter, prove the ALTER fires and new writes work).

**Deliberately not touched:** `apps/reference-storefront` -- rendering
these fields on a real PDP is an app-layer concern (shop.mdostal.com
already built its own rendering, scoped to its own theme/components, as an
app-layer `ProductAttribute` workaround it can now migrate onto these real
fields). Adding reference-storefront UI for this is a separate, optional
follow-up, not required to close the real gap.

## 3. Grill pass (adversarial check, done inline)

1. **Hidden assumption checked:** confirmed via direct `grep`/read of the
   actual `image-cdn epic` file set, not inferred from "how this probably
   works."
2. **Unresolved tension: should `videos`/`viewerUrl` collapse into one
   generic `media[]` with a `kind` discriminant, matching the "Suggested
   real fix" alternative mentioned in issue #2?** Resolved against: that
   issue explicitly says "not required to close this" and flags the
   discriminated-union version as a maybe-later idea "if this comes up for
   a second shop/use case." One consumer asking is not "a second use
   case" -- shipping the narrower, additive fields now is lower blast
   radius and still fully solves the real ask; a future union type (if ever
   warranted) can still absorb these fields without breaking anyone, since
   nothing about `videos?`/`viewerUrl?`/`license?` as plain fields
   forecloses that later refactor.
3. **Convention check:** `ProductVideo.title` required (not optional) --
   confirmed this matches `ProductImage.alt`'s own stated reasoning ("every
   rendered element needs a real label; there's no honest default").
4. **Posture check:** no seed/demo data in this repo is changed to invent a
   license string for any real product -- these fields ship empty/unused
   until a real consumer (shop) sets them, exactly mirroring how `images?`
   shipped before any seed data used it.
5. **Vocabulary check:** "viewer" (3D model viewer) vs. "video" (teardown/
   demo footage) are kept as two distinct fields, not conflated -- matches
   how the filing issue itself described them as separate concepts.

## 4. Scale assessment

**Medium** -- schema + 2 adapters + catalog service + tests, no app-layer
UI, no breaking change, same shape as the original image-cdn epic this
mirrors. Two stories: (1) schema + catalog service, (2) both adapters +
their migration-safety tests.
