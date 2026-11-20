# @mercatus-liber/media

A small interface for resolving image URLs with size and quality options, so components never hardcode a CDN.

**Status:** used by the demo stores. The passthrough adapter is what every demo runs today; `@mercatus-liber/adapter-cloudinary` is credential-gated and unverified. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createPassthroughImageAdapter } from "@mercatus-liber/media";

const images = createPassthroughImageAdapter();

const url = images.resolveUrl({
  src: "/products/mug.jpg",
  width: 800,
  fit: "cover",
  quality: 80,
});
```

The passthrough adapter returns `src` unchanged and ignores the transform options.

## Key exports

- `ImageAdapter`: `resolveUrl({ src, width?, height?, fit?, quality? })`.
- `createPassthroughImageAdapter()`.
- `MediaStore` (`put`, `get`, `urlFor`), `createInMemoryMediaStore({ baseUrl })`; `createPostgresMediaStore` is in `@mercatus-liber/adapter-postgres` (a `media_files` table).
- `copyImageToMediaStore(store, url, name)`: downloads an https PNG/JPEG/WebP/GIF (at most 10 MB) and keeps a copy, for images whose own URL won't last, such as Printful mockups.
- `serveMediaFile(store, id)`: the Response for a store's media route, cached for a year.

## Implementing an adapter

Implement `ImageAdapter` by building your CDN's transform URL from the options. `packages/adapter-cloudinary` is a short example.

This package has no subsystem doc. Adapter status is tracked in [integrations.md](../../apps/docs/content-src/integrations.md).
