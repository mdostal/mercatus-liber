import { describe, expect, it } from "vitest";
import type { PrintfulCatalogSnapshot } from "@mercatus-liber/adapter-printful";
import snapshotJson from "../lib/data/printful-catalog-snapshot.json";
import { placementLabel, printfulFacets, printfulGridItems, snapshotCaption } from "../lib/printful-admin";

const SNAPSHOT = snapshotJson as PrintfulCatalogSnapshot;

describe("Printful catalog in the admin", () => {
  it("the saved snapshot has the whole listing and every category", () => {
    expect(SNAPSHOT.products.length).toBeGreaterThan(500);
    expect(SNAPSHOT.categories.length).toBeGreaterThan(100);
    const tee = SNAPSHOT.products.find((p) => p.id === 71)!;
    expect(tee.colors.length).toBeGreaterThan(10);
    expect(tee.placements.some((p) => p.placement === "front")).toBe(true);
  });

  it("turns listings into grid items with category paths, badges and in-store links", () => {
    const items = printfulGridItems(SNAPSHOT, new Map([[71, [{ id: "p1", title: "DT Tee" }]]]), "/demo/print-shop/admin");
    const tee = items.find((i) => i.id === "71")!;
    expect(tee.href).toBe("/demo/print-shop/admin/printful/71");
    expect(tee.inStore).toEqual([{ label: "DT Tee", href: "/demo/print-shop/admin/products/p1/skus" }]);
    expect(tee.tags!.technique).toContain("dtg");
    expect(tee.tags!.placement).toContain("front");
    // A product's category tags include every parent, so filtering on "Men's clothing" finds tees.
    const parent = SNAPSHOT.categories.find((c) => String(c.id) === tee.tags!.category![0])!;
    expect(parent.parent_id).toBeNull();
    expect(items.find((i) => i.id === "1")!.inStore).toBeUndefined();
  });

  it("offers category, technique and placement filters", () => {
    const facets = printfulFacets(SNAPSHOT);
    expect(facets.map((f) => f.key)).toEqual(["category", "technique", "placement"]);
    expect(facets[1]!.options.some((o) => o.value === "embroidery")).toBe(true);
    expect(placementLabel("sleeve_left")).toBe("Sleeve left");
  });

  it("says where the list came from", () => {
    expect(snapshotCaption({ ...SNAPSHOT, fetchedAt: "2026-11-20T12:00:00Z" }, false)).toMatch(/saved copy.*20 Nov 2026.*PRINTFUL_API_TOKEN/);
    expect(snapshotCaption({ ...SNAPSHOT, fetchedAt: "2026-11-20T12:00:00Z" }, true)).toMatch(/read 20 Nov 2026/);
  });
});
