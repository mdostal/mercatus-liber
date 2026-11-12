/**
 * What a product photo shows when its file can't be loaded: a plain tinted
 * block with a small picture mark. The demo stores link photos from other
 * hosts, and when one of those hosts is down the browser would otherwise draw
 * its broken-image icon on every product card.
 */
export const BROKEN_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="400" height="300" fill="#e6e4df"/>' +
      '<g fill="none" stroke="#a8a49b" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">' +
      '<rect x="160" y="115" width="80" height="62" rx="6"/><circle cx="182" cy="136" r="6"/><path d="M164 170l22-20 14 12 16-18 22 26"/></g></svg>',
  );

/** True once an image has finished loading and got nothing it can draw. */
export function failedToLoad(image: Pick<HTMLImageElement, "complete" | "naturalWidth">): boolean {
  return image.complete && image.naturalWidth === 0;
}

/** Swaps a failed image for the placeholder. Returns false when it was already swapped or has no source. */
export function showPlaceholder(image: Pick<HTMLImageElement, "src" | "dataset" | "removeAttribute">): boolean {
  if (!image.src || image.dataset.photoMissing === "true") return false;
  image.dataset.photoMissing = "true";
  image.removeAttribute("srcset");
  image.src = BROKEN_IMAGE_PLACEHOLDER;
  return true;
}
