import type { ImageAdapter } from "@mercatus-liber/media";
import type { Product } from "@mercatus-liber/core";

/**
 * image-cdn epic: the one shared helper every card/grid/PDP/cart component
 * uses to turn a product's `images` array into a real, resolved URL --
 * centralized here so every one of those call sites shares the exact same
 * "no images -> null, never a fabricated placeholder URL" semantic and the
 * exact same primary-photo-is-images[0] convention (see Product.images's
 * own doc comment, @mercatus-liber/core), instead of each component
 * re-deriving it slightly differently. Returns `null` (not a placeholder
 * image URL) when the product has no photos at all -- every caller must
 * handle that case explicitly (e.g. omit the <img>, or render a plain
 * CSS-only placeholder box), never assume a URL always exists.
 */
export function resolveProductImageUrl(
  media: ImageAdapter,
  product: Pick<Product, "images">,
  opts: { width?: number; height?: number; fit?: "cover" | "contain"; quality?: number } = {},
): string | null {
  const primary = product.images?.[0];
  if (!primary) return null;
  return media.resolveUrl({ src: primary.url, ...opts });
}

/**
 * The alt text to use alongside resolveProductImageUrl's URL -- always the
 * real, product-supplied alt text (Product.images[i].alt is required, see
 * its own doc comment), never derived from the product title as a
 * fallback, since a photo's real subject/framing can differ from the bare
 * product name.
 */
export function resolveProductImageAlt(product: Pick<Product, "images">): string | null {
  return product.images?.[0]?.alt ?? null;
}
