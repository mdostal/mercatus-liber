/**
 * commerce-gap-audit-3, finding #8: `components/variant-picker.tsx`
 * (product-configurator epic 63, pc-01) had no dedicated test file anywhere
 * in this app's test suite -- coverage was indirect (package-level pdp/
 * catalog unit tests plus live-verification against production), never an
 * app-level render/interaction test of this component itself.
 *
 * `VariantPicker` uses a real hook (`useRef`), unlike the plain, hookless
 * function components this suite elsewhere invokes directly (see
 * recommendation-shelf.test.ts's own collectHrefs doc comment) -- calling it
 * as a bare function outside a React render throws "Invalid hook call", so
 * this file renders it for real via `react-dom/server`'s
 * `renderToStaticMarkup` (already a transitive dependency of this app's own
 * `react-dom`, not a new package) and asserts on the resulting HTML string.
 * This is also a better fit for what this component actually IS: per its
 * own doc comment, a real GET-navigation `<form>` (commit `8bf09ce`'s own
 * message: "each `<select>` auto-submits the form via `requestSubmit()`"),
 * so proving the rendered `<form method="get" action="...">` plus each
 * `<select name="...">`'s real `name`/selected-`<option>` is exactly what
 * proves a real browser submission would produce the right
 * `basePath?key=value&key2=value2` URL -- without needing jsdom or a real
 * browser to fire the actual submit event.
 *
 * `optionValues` below are never hand-fabricated -- they're the real,
 * computed `OptionValues[]` (`@mercatus-liber/pdp`'s own
 * `computeOptionValues`, called by `PdpService.getViewModel`) for the one
 * real 2-axis (color + size) variant product this repo seeds,
 * `embroidered-performance-polo` (lib/seed.ts's
 * `DEMO_MULTI_AXIS_VARIANT_PRODUCTS`, 6 real SKUs across 2 colors x 3
 * sizes), read through the real, in-memory-backed `PdpService` /
 * `CatalogService` the same way the live PDP route does -- never a mock of
 * either.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createPdpService } from "@mercatus-liber/pdp";
import { createThemingService } from "@mercatus-liber/theming";
import { VariantPicker } from "../components/variant-picker.js";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

const { catalog, marketingCatalog, cms, inventory } = buildTestCatalogServices();
await seedCatalog(catalog, marketingCatalog, cms, inventory);
const theming = createThemingService();
const pdp = createPdpService({ catalog, theming });

const viewModel = await pdp.getViewModel("embroidered-performance-polo");
if (!viewModel) throw new Error("expected the seeded embroidered-performance-polo product");

const basePath = "/demo/print-shop/products/embroidered-performance-polo";

/** Pulls every `<select name="...">` out of the rendered markup, in document order, each paired with its list of `<option value="...">` and which one carries `selected`. */
function parseSelects(html: string): { name: string; options: string[]; selected: string | undefined }[] {
  const selects: { name: string; options: string[]; selected: string | undefined }[] = [];
  const selectRe = /<select[^>]*\bname="([^"]*)"[^>]*>(.*?)<\/select>/gs;
  let match: RegExpExecArray | null;
  while ((match = selectRe.exec(html))) {
    const [, name, body] = match;
    const options: string[] = [];
    let selected: string | undefined;
    const optionRe = /<option value="([^"]*)"( selected="")?[^>]*>/g;
    let optMatch: RegExpExecArray | null;
    while ((optMatch = optionRe.exec(body!))) {
      options.push(optMatch[1]!);
      if (optMatch[2]) selected = optMatch[1]!;
    }
    selects.push({ name: name!, options, selected });
  }
  return selects;
}

describe("VariantPicker (pc-01, real optionValues from the seeded embroidered-performance-polo product)", () => {
  it("renders exactly one real <select> per identifying-attribute key, with every real value as an <option>", () => {
    expect(viewModel.optionValues.map((o) => o.key)).toEqual(["color", "size"]);
    expect(viewModel.optionValues.find((o) => o.key === "color")?.values).toEqual(["navy", "charcoal-heather"]);
    expect(viewModel.optionValues.find((o) => o.key === "size")?.values).toEqual(["small", "medium", "large"]);

    const html = renderToStaticMarkup(
      createElement(VariantPicker, {
        basePath,
        optionValues: viewModel.optionValues,
        selection: { color: "navy", size: "medium" },
      }),
    );

    const selects = parseSelects(html);
    expect(selects).toHaveLength(viewModel.optionValues.length);
    expect(selects.map((s) => s.name)).toEqual(["color", "size"]);

    const colorSelect = selects.find((s) => s.name === "color")!;
    expect(colorSelect.options).toEqual(["navy", "charcoal-heather"]);
    const sizeSelect = selects.find((s) => s.name === "size")!;
    expect(sizeSelect.options).toEqual(["small", "medium", "large"]);
  });

  it("is a real GET-navigation <form> to basePath, and a selected combination marks the exact <option>s that would produce that combination's query string on submit", () => {
    const html = renderToStaticMarkup(
      createElement(VariantPicker, {
        basePath,
        optionValues: viewModel.optionValues,
        selection: { color: "charcoal-heather", size: "large" },
      }),
    );

    expect(html).toContain(`<form class="vp-form" action="${basePath}" method="get"`);

    const selects = parseSelects(html);
    // The real query string a browser submitting this exact form would
    // produce -- one `key=value` pair per real identifying-attribute
    // select, sourced from whichever <option> actually carries `selected`.
    const producedParams = new URLSearchParams();
    for (const select of selects) {
      expect(select.selected).toBeDefined();
      producedParams.set(select.name, select.selected!);
    }
    expect(producedParams.toString()).toBe("color=charcoal-heather&size=large");
  });

  it("marks a different <option> selected for a different real selection, proving selection drives the markup rather than a hardcoded default", () => {
    const htmlA = renderToStaticMarkup(
      createElement(VariantPicker, { basePath, optionValues: viewModel.optionValues, selection: { color: "navy", size: "small" } }),
    );
    const htmlB = renderToStaticMarkup(
      createElement(VariantPicker, { basePath, optionValues: viewModel.optionValues, selection: { color: "navy", size: "large" } }),
    );

    const sizeSelectA = parseSelects(htmlA).find((s) => s.name === "size")!;
    const sizeSelectB = parseSelects(htmlB).find((s) => s.name === "size")!;
    expect(sizeSelectA.selected).toBe("small");
    expect(sizeSelectB.selected).toBe("large");
  });

  it("still renders a real, working <noscript> submit button so selection works with client JS disabled", () => {
    const html = renderToStaticMarkup(
      createElement(VariantPicker, { basePath, optionValues: viewModel.optionValues, selection: { color: "navy", size: "medium" } }),
    );
    expect(html).toMatch(/<noscript><button type="submit" class="vp-apply">Update selection<\/button><\/noscript>/);
  });
});
