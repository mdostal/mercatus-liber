// Reads Printful's whole catalog listing and categories and saves a trimmed
// copy the demo browses when it has no Printful token.
//
//   node scripts/refresh-printful-snapshot.mjs <file holding a Printful API token>
//
// The token is read from a file so it never appears in the shell history or
// the process list. About 8 requests; nothing is created at Printful.
import { readFileSync, writeFileSync } from "node:fs";
import { createPrintfulCatalogClient } from "@mercatus-liber/adapter-printful";

const tokenFile = process.argv[2];
if (!tokenFile) throw new Error("Pass the path of a file holding a Printful API token.");
const client = createPrintfulCatalogClient({ apiToken: readFileSync(tokenFile, "utf8").trim() });
const [products, categories] = await Promise.all([client.listAllCatalogProducts(), client.listCategories()]);
const trimmed = products.map((p) => ({
  id: p.id,
  type: p.type,
  main_category_id: p.main_category_id,
  name: p.name,
  brand: p.brand,
  model: p.model,
  image: p.image,
  variant_count: p.variant_count,
  is_discontinued: p.is_discontinued,
  description: p.description.length > 400 ? `${p.description.slice(0, 400).trimEnd()}…` : p.description,
  sizes: p.sizes,
  colors: p.colors,
  techniques: p.techniques.map(({ key, display_name, is_default }) => ({ key, display_name, is_default })),
  placements: p.placements.map(({ placement, technique }) => ({ placement, technique })),
}));
const out = new URL("../lib/data/printful-catalog-snapshot.json", import.meta.url);
writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), products: trimmed, categories: categories.map(({ id, parent_id, image_url, title }) => ({ id, parent_id, image_url, title })) }) + "\n");
console.log(`Saved ${trimmed.length} products and ${categories.length} categories to ${out.pathname}`);
