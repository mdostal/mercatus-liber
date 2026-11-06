# @mercatus-liber/adapter-cloudinary

An `ImageAdapter` for `@mercatus-liber/media` that serves images through Cloudinary's fetch delivery.

**Status:** built and tested, credential-gated, and unverified against a live Cloudinary account. Enabled by `CLOUDINARY_CLOUD_NAME`; without it the demo stores use the passthrough adapter. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createCloudinaryFetchAdapter } from "@mercatus-liber/adapter-cloudinary";

const images = createCloudinaryFetchAdapter({ cloudName: "my-cloud" });

const url = images.resolveUrl({
  src: "https://example.com/mug.jpg",
  width: 800,
  quality: 80,
});
```

## Key exports

- `createCloudinaryFetchAdapter({ cloudName })`: returns an `ImageAdapter`.

## Environment

- `CLOUDINARY_CLOUD_NAME`: read by the reference storefront, not by this package. Pass the value in yourself.

Adapter status is tracked in [integrations.md](../../apps/docs/content-src/integrations.md).
