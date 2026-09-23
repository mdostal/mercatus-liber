/**
 * commerce-gap-audit-3, finding #8: the admin SKU-matrix page
 * (app/demo/[demoSlug]/admin/products/[productId]/skus/page.tsx, epic 63
 * pc-03) had its mutation action's admin-auth gating tested
 * (admin-mutation-guard.test.ts's own generateSkuComboAction describe
 * block), but the page's own rendering/data-display logic -- the actual SKU
 * matrix table (attributes, price, stock, status) and its empty state -- had
 * no test anywhere in this suite.
 *
 * `getServicesForDemo` is mocked wholesale (same shape as every other
 * page-render test in this suite, e.g. reviews.test.ts /
 * variant-picker-pdp-wiring.test.ts) so this async Server Component can be
 * invoked directly against real, in-memory-backed CatalogService/
 * InventoryAdapter instances -- never a mock of either -- proving the page's
 * own display logic against real seeded data, not fabricated fixtures.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createInMemoryInventoryAdapter } from "@mercatus-liber/inventory";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
await seedCatalog(catalog, marketingCatalog, cms, inventory);

vi.mock("../lib/services.js", () => ({
  getServicesForDemo: vi.fn(async () => ({ catalog, inventory })),
}));

const { getServicesForDemo } = await import("../lib/services.js");

const { default: AdminProductSkusPage } = await import(
  "../app/demo/[demoSlug]/admin/products/[productId]/skus/page.js"
);

type Element = { type: unknown; props: Record<string, unknown> };
function isElement(node: unknown): node is Element {
  return node !== null && typeof node === "object" && "type" in (node as object) && "props" in (node as object);
}

/** Walks a rendered element tree (as returned by directly calling an async Server Component, no DOM renderer needed) and collects every element whose host tag matches `tag`, in document order. Doesn't invoke function components -- this page's own tree is 100% host elements (table/tr/td/etc.), same as recommendation-shelf.test.ts's collectHrefs. */
function collectByTag(node: ReactNode, tag: string, acc: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) collectByTag(child, tag, acc);
    return acc;
  }
  if (!isElement(node)) return acc;
  if (node.type === tag) acc.push(node);
  collectByTag(node.props.children as ReactNode, tag, acc);
  return acc;
}

/** Flattens an element's children to plain text, same base shape as recommendation-shelf.test.ts's collectHrefs walker. */
function cellText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join("");
  if (isElement(node)) return cellText(node.props.children as ReactNode);
  return "";
}

function tableRows(element: ReactNode): string[][] {
  const trs = collectByTag(element, "tbody").flatMap((tbody) => collectByTag(tbody.props.children as ReactNode, "tr"));
  return trs.map((tr) => collectByTag(tr.props.children as ReactNode, "td").map((td) => cellText(td.props.children as ReactNode)));
}

const params = (productId: string) => Promise.resolve({ demoSlug: "print-shop" as const, productId });
const noError = Promise.resolve({});

describe("AdminProductSkusPage (pc-03): real SKU-matrix rendering", () => {
  it("displays every real SKU's real attributes, formatted price, and real stock for embroidered-performance-polo (6 real color x size SKUs)", async () => {
    const product = await catalog.getProductBySlug("embroidered-performance-polo");
    if (!product) throw new Error("expected the seeded embroidered-performance-polo product");
    const skus = await catalog.listSkusByProduct(product.id);
    expect(skus).toHaveLength(6);

    const element = await AdminProductSkusPage({ params: params(product.id), searchParams: noError });
    const rows = tableRows(element);
    expect(rows).toHaveLength(6);

    // lib/seed.ts's real navy/small variant: $42.00 USD, 18 on hand.
    const navySmallSku = skus.find(
      (sku) =>
        sku.identifyingAttributes.find((a) => a.key === "color")?.value === "navy" &&
        sku.identifyingAttributes.find((a) => a.key === "size")?.value === "small",
    )!;
    const navySmallRow = rows.find((row) => row[0] === navySmallSku.id);
    expect(navySmallRow).toBeDefined();
    // [sku id, color, size, price, stock, status]
    expect(navySmallRow).toEqual([navySmallSku.id, "navy", "small", "42.00 USD", "18", "active"]);

    // lib/seed.ts's real charcoal-heather/large variant: $47.00 USD, 10 on hand -- a genuinely distinct price/stock pair, proving this isn't the first row's values repeated.
    const charcoalLargeSku = skus.find(
      (sku) =>
        sku.identifyingAttributes.find((a) => a.key === "color")?.value === "charcoal-heather" &&
        sku.identifyingAttributes.find((a) => a.key === "size")?.value === "large",
    )!;
    const charcoalLargeRow = rows.find((row) => row[0] === charcoalLargeSku.id);
    expect(charcoalLargeRow).toEqual([charcoalLargeSku.id, "charcoal-heather", "large", "47.00 USD", "10", "active"]);
  });

  it("renders the real 'not tracked' stock label for a SKU with no StockLevel record, distinct from a real tracked zero", async () => {
    const product = await catalog.createProduct({
      slug: "gap-audit-3-sku-matrix-untracked",
      title: "Gap Audit 3 Untracked Stock Product",
      description: "A product with a real SKU that has no inventory record at all.",
      identifyingAttributeKeys: ["package"],
    });
    await catalog.publishProduct(product.id);
    const [sku] = await catalog.generateSkus(product.id, { package: ["standard"] }, { amount: 1500, currency: "USD" });
    // `catalog`/`inventory` above are wired together via a real event bus
    // (buildTestCatalogServices' own registerInventorySync), which
    // auto-initializes every new SKU's stock at onHand=0 the instant it's
    // created -- so a genuine "no StockLevel record at all" state (e.g. a
    // bookable service, per docs/subsystems/11-inventory.md) can't be
    // produced on THAT same inventory instance. A second, deliberately
    // disconnected InventoryAdapter (never subscribed to any event bus, and
    // never given a record for this sku) reproduces the real "not tracked"
    // condition the page's own `stock === null ? "not tracked" : stock`
    // branch exists for -- swapped in for this one render only via
    // getServicesForDemo's own mock.
    const untrackedInventory = createInMemoryInventoryAdapter();
    expect(await untrackedInventory.getStock(sku!.id)).toBeNull();
    vi.mocked(getServicesForDemo).mockResolvedValueOnce({ catalog, inventory: untrackedInventory } as never);

    const element = await AdminProductSkusPage({ params: params(product.id), searchParams: noError });
    const rows = tableRows(element);
    expect(rows).toEqual([[sku!.id, "standard", "15.00 USD", "not tracked", "active"]]);
  });

  it("renders the real empty-matrix state ('No SKUs yet for this product.') for a real product with zero generated SKUs, with no fabricated row", async () => {
    const product = await catalog.createProduct({
      slug: "gap-audit-3-sku-matrix-empty",
      title: "Gap Audit 3 Empty Matrix Product",
      description: "A real, published product with no SKUs generated yet.",
      identifyingAttributeKeys: ["color", "size"],
    });
    await catalog.publishProduct(product.id);
    expect(await catalog.listSkusByProduct(product.id)).toHaveLength(0);

    const element = await AdminProductSkusPage({ params: params(product.id), searchParams: noError });

    const rows = tableRows(element);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["No SKUs yet for this product."]);

    const headings = collectByTag(element, "h1").map((el) => cellText(el.props.children as ReactNode));
    expect(headings[0]).toContain("Gap Audit 3 Empty Matrix Product");
  });

  it("shows an admin-supplied error message from the real ?error= search param, e.g. after an invalid generateSkuComboAction submission", async () => {
    const product = await catalog.getProductBySlug("embroidered-dad-cap");
    if (!product) throw new Error("expected the seeded embroidered-dad-cap product");

    const element = await AdminProductSkusPage({
      params: params(product.id),
      searchParams: Promise.resolve({ error: "That combination already exists." }),
    });

    const paragraphs = collectByTag(element, "p").map((el) => cellText(el.props.children as ReactNode));
    expect(paragraphs).toContain("That combination already exists.");
  });
});
