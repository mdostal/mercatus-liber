/**
 * The Shopify Admin GraphQL API version this tool targets.
 *
 * Verified directly against Shopify's own live developer docs on 2026-10-07
 * (not from training data -- Shopify's API is versioned quarterly and
 * training data goes stale fast):
 *   - https://shopify.dev/changelog/release-notes/latest resolved to
 *     "2026-10", with the page itself stating 2026-10 "is available as a
 *     release candidate for development testing until October 1, 2026, when
 *     it becomes stable" -- today (2026-10-07) is after that date, so 2026-10
 *     is the current stable release (stable through 2027-10-16 15:00 UTC).
 *   - https://shopify.dev/docs/api/usage/versioning confirms Shopify's
 *     support window: "Each stable version is supported for a minimum of 12
 *     months, with at least nine months of overlap between consecutive
 *     versions."
 *
 * IMPORTANT -- this is a NEWER version than @mercatus-liber/adapter-shopify's
 * own DEFAULT_API_VERSION ("2025-01", see packages/adapter-shopify/src/
 * graphql-client.ts). Checked: 2025-01 is now well outside even the most
 * generous reading of that support window (12 months minimum + 9 months
 * overlap puts its outer retirement edge around mid-2026), so that default is
 * stale/likely-retired. This package does NOT rely on that default -- it
 * always passes its own, current `apiVersion` explicitly when constructing a
 * client via `createGraphQLClient`. Fixing adapter-shopify's own default is
 * out of scope for this read-only migration-tool slice (a separate package,
 * with its own tests already pinned to its current behavior); flagged here
 * and in this epic's closeout notes instead of silently patched.
 */
export const SHOPIFY_API_VERSION = "2026-10";
