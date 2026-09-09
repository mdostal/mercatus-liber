import type { ImageAdapter, ResolveImageUrlInput } from "./types.js";

/**
 * The zero-infra default ImageAdapter -- returns `src` completely
 * unchanged, ignoring every transform hint. This is a genuinely honest
 * default, not a degraded stand-in: this reference app's real product
 * photos (image-cdn epic) are already served from a real photo host, and
 * "serve exactly the URL you were given, no resize/optimize" is a
 * completely valid, functioning choice for any merchant who hasn't wired a
 * real CDN yet -- the same posture createManualShippingAdapter() and
 * createManualFulfillmentAdapter() take for their own subsystems (always
 * present, always functional, never fabricates capability it doesn't
 * have). Swapping in @mercatus-liber/adapter-cloudinary (or any other real
 * ImageAdapter) requires no change anywhere this adapter is consumed.
 */
export function createPassthroughImageAdapter(): ImageAdapter {
  return {
    resolveUrl(input: ResolveImageUrlInput): string {
      return input.src;
    },
  };
}
