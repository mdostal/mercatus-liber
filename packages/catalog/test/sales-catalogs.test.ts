import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryEventBus, InvalidScheduleError } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createCatalogService, createInMemoryCatalogRepository, createInMemoryProductCatalogRepository, ProductNotFoundError } from "../src/index.js";

const WEEK1 = { activeFrom: "2026-11-30T18:00:00.000Z", activeTo: "2026-12-07T18:00:00.000Z" };
const WEEK2 = { activeFrom: "2026-12-07T18:00:00.000Z", activeTo: "2026-12-14T18:00:00.000Z" };

async function setup() {
  const catalog = createCatalogService({ persistence: createSqliteAdapter(":memory:"), events: createInMemoryEventBus(), catalogs: createInMemoryCatalogRepository(), productCatalogs: createInMemoryProductCatalogRepository() });
  const master = await catalog.createCatalog({ slug: "shop", name: "Shop", description: "" });
  const make = async (slug: string) => {
    const p = await catalog.createProduct({ slug, title: slug, description: "", identifyingAttributeKeys: ["size"] });
    await catalog.assignProductToCatalog(p.id, master.id);
    return catalog.publishProduct(p.id);
  };
  return { catalog, master, mat: await make("frost-mat"), tee: await make("frost-tee"), hat: await make("frost-hat"), draft: await catalog.createProduct({ slug: "draft", title: "d", description: "", identifyingAttributeKeys: [] }) };
}

describe("sales catalogs (lines)", () => {
  it("creates a scheduled line with a hero and ordered sections, adding the named products to it", async () => {
    const { catalog, master, mat, tee, hat } = await setup();
    const line = await catalog.createCatalog({
      slug: "frost",
      name: "Frost",
      description: "Week 1",
      kind: "sales",
      masterCatalogId: master.id,
      activeFrom: "2026-11-30T12:00:00-06:00",
      activeTo: WEEK1.activeTo,
      hero: { title: "Frost", subtitle: "One week only" },
      sections: [
        { slug: "desk", title: "Desk", productIds: [mat.id] },
        { slug: "shirts", title: "Shirts", productIds: [tee.id, tee.id] },
        { slug: "hats", title: "Hats", productIds: [] },
      ],
    });
    expect(line).toMatchObject({ kind: "sales", masterCatalogId: master.id, ...WEEK1, sections: [{ productIds: [mat.id] }, { productIds: [tee.id] }, { productIds: [] }] });
    expect((await catalog.listProductIdsInCatalog(line.id)).sort()).toEqual([mat.id, tee.id].sort());
    await catalog.assignProductToCatalog(hat.id, line.id);

    const before = (await catalog.getCatalogLanding("frost", new Date("2026-11-29T00:00:00Z")))!;
    expect(before.lifecycle).toMatchObject({ state: "upcoming", nextChangeAt: WEEK1.activeFrom });
    expect(before.sections.map((s) => [s.slug, s.products.map((p) => p.slug)])).toEqual([["desk", ["frost-mat"]], ["shirts", ["frost-tee"]], ["hats", []]]);
    expect(before.otherProducts.map((p) => p.slug)).toEqual(["frost-hat"]);
    expect((await catalog.getCatalogLanding(line.id, new Date(WEEK1.activeTo)))!.lifecycle.state).toBe("ended");

    expect(await catalog.listCatalogs({ kind: "sales", masterCatalogId: master.id })).toHaveLength(1);
    expect(await catalog.listCatalogs({ kind: "master" })).toHaveLength(1);
  });

  it("gives a line with no products its own landing page", async () => {
    const { catalog, master } = await setup();
    await catalog.createCatalog({ slug: "vault", name: "Vault", description: "", kind: "sales", masterCatalogId: master.id, ...WEEK2, hero: { title: "From the vault" }, sections: [{ slug: "desk", title: "Desk", productIds: [] }] });
    const landing = (await catalog.getCatalogLanding("vault", new Date("2026-12-01T00:00:00Z")))!;
    expect(landing).toMatchObject({ catalog: { hero: { title: "From the vault" } }, lifecycle: { state: "upcoming" }, sections: [{ slug: "desk", products: [] }], otherProducts: [] });
  });

  it("gives products a window covering every line they're in, so overlapping lines share them", async () => {
    const { catalog, master, tee, mat } = await setup();
    const frost = await catalog.createCatalog({ slug: "frost", name: "Frost", description: "", kind: "sales", masterCatalogId: master.id, ...WEEK1, sections: [{ slug: "shirts", title: "Shirts", productIds: [tee.id, mat.id] }] });
    await catalog.createCatalog({ slug: "ember", name: "Ember", description: "", kind: "sales", masterCatalogId: master.id, ...WEEK2, sections: [{ slug: "shirts", title: "Shirts", productIds: [tee.id] }] });
    expect((await catalog.applyCatalogWindowToProducts(frost.id)).updated.sort()).toEqual([tee.id, mat.id].sort());
    expect(await catalog.getProduct(tee.id)).toMatchObject({ activeFrom: WEEK1.activeFrom, activeTo: WEEK2.activeTo });
    expect(await catalog.getProduct(mat.id)).toMatchObject(WEEK1);
    expect((await catalog.applyCatalogWindowToProducts(frost.id)).updated).toEqual([]);
    // Bring the mat back after its week.
    expect("activeTo" in (await catalog.updateProduct(mat.id, { activeTo: null }))).toBe(false);
  });

  it("updates a line's schedule and sections, and refuses bad input before saving", async () => {
    const { catalog, master, tee } = await setup();
    const line = await catalog.createCatalog({ slug: "frost", name: "Frost", description: "", kind: "sales", masterCatalogId: master.id, ...WEEK1 });
    const moved = await catalog.updateCatalog(line.id, { activeTo: null, sections: [{ slug: "shirts", title: "Shirts", productIds: [tee.id] }] });
    expect(moved.activeFrom).toBe(WEEK1.activeFrom);
    expect("activeTo" in moved).toBe(false);
    expect(await catalog.listProductIdsInCatalog(line.id)).toEqual([tee.id]);
    await expect(catalog.updateCatalog(line.id, { sections: [{ slug: "x", title: "X", productIds: ["nope"] }] })).rejects.toBeInstanceOf(ProductNotFoundError);
    expect((await catalog.getCatalog(line.id))!.sections![0]!.slug).toBe("shirts");
    await expect(catalog.updateCatalog(line.id, { activeFrom: WEEK1.activeTo, activeTo: WEEK1.activeFrom })).rejects.toBeInstanceOf(InvalidScheduleError);
    await expect(catalog.updateCatalog(line.id, { sections: [{ slug: "Bad Slug", title: "B", productIds: [] }] })).rejects.toThrow(/lowercase/);
    // Catalogs saved before these fields existed read as plain master catalogs.
    expect(await catalog.getCatalog(master.id)).toEqual({ id: master.id, slug: "shop", name: "Shop", description: "", createdAt: master.createdAt });
  });
});
