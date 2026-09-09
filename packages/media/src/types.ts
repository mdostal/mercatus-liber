/**
 * A request to turn a raw product-photo reference into a real, deliverable
 * image URL. Every field beyond `src` is a HINT, not a guarantee -- a
 * provider that can't honor a given width/height/fit/quality combination is
 * expected to do its best (e.g. round to the nearest supported preset)
 * rather than throw, the same "never fail a whole page over an optional
 * optimization" posture @mercatus-liber/shipping's rate lookups take.
 */
export interface ResolveImageUrlInput {
  /** The raw image reference to resolve -- almost always an absolute URL (an external host, a CDN asset path, ...), never raw binary image data. */
  src: string;
  width?: number;
  height?: number;
  /** "cover" crops to fill the exact box (the common product-card/thumbnail case); "contain" letterboxes to fit inside it without cropping (useful for a PDP hero that shouldn't crop a product photo). Omit for the provider's own default. */
  fit?: "cover" | "contain";
  /** 1-100. Omit to let the provider pick its own default/auto quality. */
  quality?: number;
}

/**
 * The adapter interface every image-CDN/transform provider implements
 * (image-cdn epic). Deliberately synchronous and pure (no network call, no
 * Promise) -- every real provider this pattern fits (Cloudinary fetch mode,
 * imgix, Vercel's built-in image optimizer, a plain file host with URL-based
 * resize params) resolves a transform request to a URL by STRING
 * CONSTRUCTION alone; the actual fetch/transform/cache work happens later,
 * on the CDN edge, when a browser requests that URL -- never inside this
 * call. This mirrors PaymentAdapter.createPaymentSession's "return a
 * redirect URL, never process anything synchronously here" shape.
 */
export interface ImageAdapter {
  resolveUrl(input: ResolveImageUrlInput): string;
}
