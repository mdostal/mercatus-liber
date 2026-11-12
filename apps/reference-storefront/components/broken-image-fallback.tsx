"use client";

import { useEffect } from "react";
import { failedToLoad, showPlaceholder } from "../lib/broken-image";

/**
 * Replaces any photo that fails to load with a plain placeholder
 * (lib/broken-image.ts). Mounted once in the demo layout, so it covers every
 * product card, product page and cart line. Renders nothing.
 *
 * Image errors don't bubble, so the listener is on the capture phase. Photos
 * that failed before this ran are caught by the check on mount.
 */
export function BrokenImageFallback() {
  useEffect(() => {
    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) showPlaceholder(event.target);
    };
    document.addEventListener("error", onError, true);
    for (const image of Array.from(document.images)) if (failedToLoad(image)) showPlaceholder(image);
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
