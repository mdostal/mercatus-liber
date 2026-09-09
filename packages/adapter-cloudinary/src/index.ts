import type { ImageAdapter, ResolveImageUrlInput } from "@mercatus-liber/media";

export interface CloudinaryFetchAdapterConfig {
  /** A Cloudinary account's cloud name (dashboard home page) -- the only credential fetch mode needs; no API key/secret required for this unsigned, read-only URL-construction use. */
  cloudName: string;
}

/**
 * fit -> Cloudinary's own real crop-mode names: "cover" (crop to exactly
 * fill the box) is Cloudinary's `c_fill`; "contain" (scale to fit inside
 * the box, no cropping) is Cloudinary's `c_fit`. Confirmed against
 * Cloudinary's own current image-transformation documentation.
 */
const FIT_TO_CROP_MODE: Record<NonNullable<ResolveImageUrlInput["fit"]>, string> = {
  cover: "c_fill",
  contain: "c_fit",
};

/**
 * ImageAdapter backed by Cloudinary's real "fetch" delivery type -- see this
 * package's package.json description for the confirmed URL shape and how
 * it works. resolveUrl is pure string construction (no network call, per
 * ImageAdapter's own doc comment): the actual fetch/transform/cache happens
 * on Cloudinary's CDN the first time a browser requests the constructed
 * URL, not here.
 *
 * Per Cloudinary's own documented fetch-mode URL shape, the trailing
 * remote-image URL is appended RAW (not percent-encoded) -- confirmed
 * against Cloudinary's own published example
 * (`.../image/fetch/w_150,h_150,.../https://upload.wikimedia.org/...png`).
 * Percent-encoding it would double-encode and break Cloudinary's own
 * parsing, which expects everything after the last transformation segment
 * to be the literal remote URL.
 */
export function createCloudinaryFetchAdapter(config: CloudinaryFetchAdapterConfig): ImageAdapter {
  const { cloudName } = config;

  return {
    resolveUrl(input: ResolveImageUrlInput): string {
      const transforms: string[] = [];
      if (input.width) transforms.push(`w_${input.width}`);
      if (input.height) transforms.push(`h_${input.height}`);
      if (input.fit) transforms.push(FIT_TO_CROP_MODE[input.fit]);
      transforms.push(input.quality ? `q_${input.quality}` : "q_auto");
      // f_auto: Cloudinary picks the best real format (WebP/AVIF/etc.) for
      // the requesting browser automatically -- always on, real Cloudinary
      // flag, not something worth making configurable.
      transforms.push("f_auto");

      const transformSegment = transforms.join(",");
      return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformSegment}/${input.src}`;
    },
  };
}
