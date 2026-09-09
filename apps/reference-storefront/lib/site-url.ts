/**
 * seo-01: the real, deployed public base URL of THIS app (reference-storefront
 * -- commerce.mdostal.com, per .pHive/epics/commerce-landing-and-demo-routing/
 * docs/design-discussion.md's "commerce.mdostal.com/ is a real marketing/
 * landing page for Mercatus Liber" resolution). Distinct from
 * NEXT_PUBLIC_DOCS_URL, which points at the separate apps/docs deployment.
 *
 * No env var for this app's own deployed URL existed before this story
 * (grepped lib/services.ts and README.md's whole "Configuration" section --
 * confirmed, not assumed). NEXT_PUBLIC_SITE_URL is the sibling
 * NEXT_PUBLIC_DOCS_URL's doc comment already anticipates
 * ("apps/(landing)/layout.tsx" style: unset falls back rather than breaking).
 *
 * Unlike NEXT_PUBLIC_DOCS_URL's placeholder fallback (that link is purely
 * decorative, so a labeled-broken URL is fine), canonical <link> tags need
 * to actually resolve to a real, well-formed absolute URL in local dev too
 * -- generateMetadata's own acceptance criteria are verified against a real
 * running dev server -- so the fallback here is a genuine usable origin
 * (localhost:3000, this app's own `next dev` default port) instead of a
 * placeholder string.
 */
const SITE_URL_FALLBACK = "http://localhost:3000";

export function getSiteUrl(): string {
  // Trim any trailing slash so canonicalUrl's `new URL(path, base)` composition
  // never produces an accidental double slash.
  return (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL_FALLBACK).replace(/\/+$/, "");
}

/** Composes a real absolute canonical URL for `path` (e.g. "/demo/print-shop") against the real site base URL above. */
export function canonicalUrl(path: string): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}
