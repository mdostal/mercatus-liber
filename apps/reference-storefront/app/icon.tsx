import { ImageResponse } from "next/og";

/**
 * bs-03-docs-site-and-favicon: real favicon for apps/reference-storefront, using the
 * `app/icon.tsx` code-generation convention confirmed live against this Next.js version's
 * own docs (node_modules/next/dist/docs/.../file-conventions/01-metadata/app-icons.md --
 * "icon" supports .js/.ts/.tsx via next/og's ImageResponse; no favicon.ico or static
 * icon.png existed in this app before this change, so this is a genuinely new asset, not
 * a replacement).
 *
 * Placed at the app root (not inside `(landing)/**`, which is bs-02's concurrent scope) so
 * Next.js's metadata-file convention applies it to every route in this app, including both
 * the framework landing page and `app/demo/[demoSlug]/**`.
 *
 * Mark: a single "M" monogram derived from the brand guide's typographic wordmark
 * (.pHive/brand/brand-guide.html "Logo Concepts" -- the system deliberately ships a
 * wordmark-only identity, no separate icon-mark asset, since openai-image is confirmed
 * disconnected this session; see brand-system.yaml `logo_decision`). Colors are the real
 * brand-system.yaml tokens: Ledger Indigo (#4338A0, primary) fill with a Paper Neutral
 * (#F3F3F1, surface) glyph -- the same primary-fill/light-text pairing brand-guide.html's
 * "Background variants" section shows for the wordmark on the indigo swatch. Radius uses
 * the brand's "medium" token (4px) scaled to this icon's 32px canvas.
 */
export const size = {
  width: 32,
  height: 32
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4338A0",
          borderRadius: 6
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1,
            color: "#F3F3F1",
            fontFamily: "sans-serif",
            letterSpacing: "-0.02em"
          }}
        >
          M
        </span>
      </div>
    ),
    { ...size }
  );
}
