#!/usr/bin/env node
import { createGraphQLClient } from "@mercatus-liber/adapter-shopify";
import { SHOPIFY_API_VERSION } from "./api-version.js";
import { readShopifyCatalog } from "./read-catalog.js";

/**
 * `migrate-shopify-read` -- a minimal, real CLI entry point for this
 * package's read side. It connects to a real Shopify store, reads its
 * entire catalog (products, variants, inventory, collections), and prints a
 * JSON summary to stdout.
 *
 * This is NOT the full migration tool described in this epic's
 * design-discussion.md (no write path, no dry-run report, no idempotency --
 * those are separate, later work once the write side exists). It exists so
 * this package's real read path is reachable as a standalone command today,
 * matching this repo's `packages/create-store` precedent for what a
 * standalone CLI tool package looks like.
 *
 * No live Shopify store credentials exist in this development environment
 * (see this epic's design-discussion.md, section 4) -- this command is
 * untested against a real store; it is tested against injected fakes (see
 * test/fake-graphql-client.ts) that implement the same GraphQLClient
 * interface this CLI constructs for real via createGraphQLClient.
 */
function usage(): never {
  console.error(
    "Usage: SHOPIFY_SHOP=<shop>.myshopify.com SHOPIFY_ACCESS_TOKEN=<token> [SHOPIFY_CURRENCY=USD] migrate-shopify-read",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop || !accessToken) usage();

  const client = createGraphQLClient({ shop, accessToken, apiVersion: SHOPIFY_API_VERSION });
  const currency = process.env.SHOPIFY_CURRENCY ?? "USD";

  const snapshot = await readShopifyCatalog(client, { currency });

  const totalVariants = snapshot.products.reduce((sum, p) => sum + p.variants.length, 0);
  const totalOnHand = snapshot.products.reduce(
    (sum, p) => sum + p.variants.reduce((inner, v) => inner + v.inventory.onHand, 0),
    0,
  );

  console.log(
    JSON.stringify(
      {
        shop,
        apiVersion: SHOPIFY_API_VERSION,
        summary: {
          products: snapshot.products.length,
          variants: totalVariants,
          collections: snapshot.collections.length,
          totalOnHandAcrossAllLocations: totalOnHand,
        },
        products: snapshot.products,
        collections: snapshot.collections,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
