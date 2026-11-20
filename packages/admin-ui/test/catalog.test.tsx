// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CatalogGrid, CatalogItemDetail, filterCatalogItems, type CatalogGridItem } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: CatalogGridItem[] = [
  { id: "71", name: "Unisex Staple T-Shirt", subtitle: "Bella + Canvas 3001", href: "/p/71", tags: { technique: ["dtg", "embroidery"], category: ["24", "1"] }, badges: ["62 colours"], inStore: [{ label: "DT Tee", href: "/admin/products/tee" }] },
  { id: "1", name: "Enhanced Matte Paper Poster", href: "/p/1", tags: { technique: ["digital"], category: ["55"] } },
  { id: "12", name: "Heavy Cotton Tee", subtitle: "Gildan 5000", href: "/p/12", tags: { technique: ["dtg"], category: ["24", "1"] } },
];

describe("filterCatalogItems", () => {
  it("matches every search word in name or subtitle, each facet, and in-store", () => {
    expect(filterCatalogItems(ITEMS, "bella 3001", {}).map((i) => i.id)).toEqual(["71"]);
    expect(filterCatalogItems(ITEMS, "", { technique: "dtg" }).map((i) => i.id)).toEqual(["71", "12"]);
    expect(filterCatalogItems(ITEMS, "shirt", { category: "1" }, true).map((i) => i.id)).toEqual(["71"]);
    expect(filterCatalogItems(ITEMS, "", { technique: "" }).length).toBe(3);
  });
});

describe("catalog components", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const setValue = async (el: HTMLInputElement | HTMLSelectElement, value: string) =>
    act(async () => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });

  it("CatalogGrid filters as you type and choose, marks in-store items, and pages", async () => {
    await act(async () => root.render(<CatalogGrid items={ITEMS} pageSize={2} facets={[{ key: "technique", label: "Technique", options: [{ value: "dtg", label: "DTG" }, { value: "digital", label: "Digital" }] }]} caption="From Printful, read 2026-11-20" />));
    const ids = () => [...container.querySelectorAll("[data-item]")].map((li) => li.getAttribute("data-item"));
    expect(ids()).toEqual(["71", "1"]);
    expect(container.textContent).toContain("3 of 3 shown (first 2)");
    expect(container.querySelector("[data-item='71']")!.textContent).toContain("In store");
    expect(container.querySelector("[data-item='71'] a[href='/admin/products/tee']")!.textContent).toBe("DT Tee");
    await act(async () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Show more")!.click());
    expect(ids()).toEqual(["71", "1", "12"]);
    await setValue(container.querySelector<HTMLSelectElement>("select[data-facet=technique]")!, "dtg");
    expect(ids()).toEqual(["71", "12"]);
    await setValue(container.querySelector<HTMLInputElement>("input[type=search]")!, "gildan");
    expect(ids()).toEqual(["12"]);
  });

  it("CatalogItemDetail shows the colour by size table, unavailable and missing variants, and print areas", async () => {
    await act(async () =>
      root.render(
        <CatalogItemDetail
          name="Unisex Staple T-Shirt"
          colors={[{ name: "Black", hex: "#000" }, { name: "Aqua", hex: "#008db5" }]}
          sizes={["S", "XL"]}
          cells={{ "Black|S": { cost: "$13.92" }, "Black|XL": { cost: "$13.92", available: false }, "Aqua|S": {} }}
          printAreas={[{ label: "Front print", technique: "DTG", size: "12 × 16 in, 1800 × 2400 px at 150 dpi" }]}
          links={[{ label: "Back to the catalog", href: "/admin/printful" }]}
          notice="Costs come from Printful's price list."
        >
          <p id="child">Bring over</p>
        </CatalogItemDetail>,
      ),
    );
    const cell = (k: string) => container.querySelector(`[data-cell='${k}']`)!.textContent;
    expect(cell("Black|S")).toBe("$13.92");
    expect(cell("Black|XL")).toBe("$13.92 out");
    expect(cell("Aqua|S")).toBe("✓");
    expect(cell("Aqua|XL")).toBe("–");
    expect(container.querySelector("[data-print-area='Front print']")!.textContent).toContain("1800 × 2400 px");
    expect(container.querySelector("[role=note]")!.textContent).toContain("price list");
    expect(container.querySelector("#child")).not.toBeNull();
  });
});
