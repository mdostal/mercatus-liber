#!/usr/bin/env node
import { createGraphQLClient } from "@mercatus-liber/adapter-shopify";
import { SHOPIFY_API_VERSION } from "./api-version.js";
import { readShopifyCatalog } from "./read-catalog.js";
import { importShopifyCatalog, type ImportReport } from "./write-catalog.js";
import { createTargetPersistence, type MigrationTarget } from "./targets.js";

/**
 * `migrate-shopify` -- the real, full CLI entry point for this epic: a
 * single real command that reads a merchant's entire live Shopify catalog
 * (products, variants, inventory, collections) and imports it into one of
 * this repo's own native persistence backends, through the exact same
 * `readShopifyCatalog`/`importShopifyCatalog` functions this package
 * exports programmatically and the same `CatalogService`/
 * `MarketingCatalogService`/`InventoryAdapter` construction
 * `apps/reference-storefront/lib/services.ts` uses for real deployments
 * (see targets.ts).
 *
 * Safe by construction: this command ALWAYS performs a dry run (zero
 * writes -- only reads against the target to compute an accurate report)
 * unless the caller passes `--confirm` explicitly. There is no other way
 * to make it write.
 *
 * Distinct from this package's other bin, `migrate-shopify-read`
 * (cli.ts), which only exercises the read side and prints the raw
 * snapshot -- kept as-is for backward compatibility with anyone already
 * using it. This command is the one a real merchant should actually run.
 *
 * No real Shopify store credentials exist in this development
 * environment -- this command has been run and its real printed output
 * inspected against injected fakes (a fake GraphQL client for the read
 * side, a real in-process SQLite database for the write side), never
 * against a real Shopify store. See this package's README, "Honest
 * disclosure" section, before relying on this against production data.
 */

interface CliArgs {
  shop: string;
  accessToken: string;
  currency: string;
  target: MigrationTarget;
  confirm: boolean;
  sampleSize: number | undefined;
}

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    [
      "Usage: migrate-shopify --target <sqlite|postgres> [options]",
      "",
      "Shopify source (required -- flag or env var):",
      "  --shop <shop>.myshopify.com       or SHOPIFY_SHOP",
      "  --access-token <shpat_...>        or SHOPIFY_ACCESS_TOKEN",
      "  --currency <ISO code>             or SHOPIFY_CURRENCY (default: USD)",
      "",
      "Native target (required):",
      "  --target sqlite --sqlite-file <path>     or SQLITE_FILE_PATH",
      "  --target postgres --database-url <url>   or DATABASE_URL",
      "",
      "Write mode:",
      "  (default)   dry run -- reads the live Shopify catalog and the target's",
      "              CURRENT state, writes nothing, prints a full ImportReport.",
      "  --confirm   performs the real import (idempotent -- safe to re-run).",
      "",
      "Other:",
      "  --sample-size <n>   how many real product titles to show in the report (default 5)",
      "",
      "Example (dry run, the safe default):",
      "  migrate-shopify --shop my-shop.myshopify.com --access-token shpat_xxx \\",
      "    --target sqlite --sqlite-file ./my-shop.sqlite",
      "",
      "Example (real import, once the dry-run report looks right):",
      "  migrate-shopify --shop my-shop.myshopify.com --access-token shpat_xxx \\",
      "    --target sqlite --sqlite-file ./my-shop.sqlite --confirm",
    ].join("\n"),
  );
  process.exit(1);
}

function parseFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return flags;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = parseFlags(argv);
  const str = (key: string): string | undefined => {
    const v = flags.get(key);
    return typeof v === "string" ? v : undefined;
  };

  const shop = str("shop") ?? process.env.SHOPIFY_SHOP;
  const accessToken = str("access-token") ?? process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shop) usage("missing --shop (or SHOPIFY_SHOP)");
  if (!accessToken) usage("missing --access-token (or SHOPIFY_ACCESS_TOKEN)");

  const currency = str("currency") ?? process.env.SHOPIFY_CURRENCY ?? "USD";

  const targetKind = str("target");
  if (targetKind !== "sqlite" && targetKind !== "postgres") {
    usage('missing/invalid --target (must be "sqlite" or "postgres")');
  }

  let target: MigrationTarget;
  if (targetKind === "sqlite") {
    const filePath = str("sqlite-file") ?? process.env.SQLITE_FILE_PATH;
    if (!filePath) usage("--target sqlite requires --sqlite-file <path> (or SQLITE_FILE_PATH)");
    target = { kind: "sqlite", filePath };
  } else {
    const connectionString = str("database-url") ?? process.env.DATABASE_URL;
    if (!connectionString) usage("--target postgres requires --database-url <url> (or DATABASE_URL)");
    target = { kind: "postgres", connectionString };
  }

  const confirm = flags.get("confirm") === true || str("confirm") === "true";
  const sampleSizeRaw = str("sample-size");
  const sampleSize = sampleSizeRaw !== undefined ? Number(sampleSizeRaw) : undefined;
  if (sampleSize !== undefined && (!Number.isFinite(sampleSize) || sampleSize < 0)) {
    usage("--sample-size must be a non-negative number");
  }

  return { shop, accessToken, currency, target, confirm, sampleSize };
}

function printCounts(label: string, counts: ImportReport["products"]): void {
  console.log(`  ${label.padEnd(12)} total=${counts.total}  created=${counts.created}  skipped=${counts.skipped}  failed=${counts.failed}`);
}

function printReport(report: ImportReport, shop: string): void {
  console.log("");
  console.log(`=== Shopify migration ${report.dryRun ? "DRY RUN (no writes performed)" : "IMPORT (real writes performed)"} ===`);
  console.log(`Source shop: ${shop}`);
  console.log("");
  printCounts("Products", report.products);
  printCounts("SKUs", report.skus);
  printCounts("Categories", report.categories);
  printCounts("Assignments", report.assignments);
  console.log("");

  if (report.sampleProductTitles.length > 0) {
    console.log(`Sample product titles (${report.sampleProductTitles.length}):`);
    for (const title of report.sampleProductTitles) console.log(`  - ${title}`);
    console.log("");
  }

  if (report.attention.length > 0) {
    console.log(`Needs attention (${report.attention.length} item(s) -- not imported cleanly, review before trusting the import is complete):`);
    for (const item of report.attention) console.log(`  [${item.kind}] ${item.identifier}: ${item.reason}`);
    console.log("");
  } else {
    console.log("Nothing needs attention -- every record mapped cleanly.");
    console.log("");
  }

  if (report.dryRun) {
    console.log("This was a DRY RUN. No data was written to the target. Re-run with --confirm to perform the real import.");
  } else {
    console.log("This was a REAL import. The counts above reflect what was actually written.");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Reading live catalog from ${args.shop} (Shopify Admin API ${SHOPIFY_API_VERSION})...`);
  const client = createGraphQLClient({ shop: args.shop, accessToken: args.accessToken, apiVersion: SHOPIFY_API_VERSION });
  const snapshot = await readShopifyCatalog(client, { currency: args.currency });
  console.log(`Read ${snapshot.products.length} product(s) and ${snapshot.collections.length} collection(s) from Shopify.`);

  const persistence = await createTargetPersistence(args.target);
  try {
    if (args.confirm) {
      console.log("--confirm passed: performing a REAL import (writes will be made).");
    } else {
      console.log("No --confirm passed: performing a DRY RUN (no writes will be made). Pass --confirm to actually import.");
    }

    const report = await importShopifyCatalog(
      snapshot,
      persistence,
      args.sampleSize !== undefined ? { dryRun: !args.confirm, sampleSize: args.sampleSize } : { dryRun: !args.confirm },
    );
    printReport(report, args.shop);
  } finally {
    await persistence.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
