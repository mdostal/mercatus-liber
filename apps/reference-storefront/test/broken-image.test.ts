import { describe, expect, it } from "vitest";
import { BROKEN_IMAGE_PLACEHOLDER, failedToLoad, showPlaceholder } from "../lib/broken-image";

const image = (src: string) => {
  const removed: string[] = [];
  return { src, dataset: {} as DOMStringMap, removeAttribute: (name: string) => void removed.push(name), removed };
};

describe("broken photo placeholder", () => {
  it("treats a finished image with no pixels as failed", () => {
    expect(failedToLoad({ complete: true, naturalWidth: 0 })).toBe(true);
    expect(failedToLoad({ complete: true, naturalWidth: 800 })).toBe(false);
    expect(failedToLoad({ complete: false, naturalWidth: 0 })).toBe(false);
  });

  it("swaps a failed photo for the placeholder once", () => {
    const img = image("https://photos.example/poster.jpg");
    expect(showPlaceholder(img)).toBe(true);
    expect(img.src).toBe(BROKEN_IMAGE_PLACEHOLDER);
    expect(img.removed).toEqual(["srcset"]);
    expect(showPlaceholder(img)).toBe(false);
  });

  it("leaves an image with no source alone", () => {
    expect(showPlaceholder(image(""))).toBe(false);
  });

  it("is an inline SVG, so it can't fail to load itself", () => {
    expect(BROKEN_IMAGE_PLACEHOLDER.startsWith("data:image/svg+xml,")).toBe(true);
  });
});
