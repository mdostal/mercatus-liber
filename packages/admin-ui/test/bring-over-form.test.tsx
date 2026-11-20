// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BringOverForm, parseMoneyToCents, slugify, type BringOverSelection } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("helpers", () => {
  it("slugifies names and parses money", () => {
    expect(slugify("Unisex Staple T-Shirt — Québec")).toBe("unisex-staple-t-shirt-quebec");
    expect(parseMoneyToCents("$24")).toBe(2400);
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents("-3")).toBeNull();
  });
});

describe("BringOverForm", () => {
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
  const type = async (el: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const click = (el: HTMLElement) => act(async () => el.click());
  const byText = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text)!;

  it("checks the choices, shows costs and margins, and submits the selection", async () => {
    const onPlan = vi.fn(async (s: BringOverSelection) => ({ ok: true as const, rows: s.sizes.map((size) => ({ color: s.colors[0]!, size, priceCents: s.retailCents + (s.sizeUpchargeCents[size] ?? 0), costCents: 1300, marginCents: s.retailCents + (s.sizeUpchargeCents[size] ?? 0) - 1300 })) }));
    const onSubmit = vi.fn(async () => ({ ok: true as const, message: "Created Tee with 2 draft SKUs.", href: "/admin/products/p1/skus" }));
    await act(async () =>
      root.render(
        <BringOverForm
          colors={[{ name: "Black", hex: "#000" }, { name: "White", hex: "#fff" }]}
          sizes={["S", "2XL"]}
          techniques={[{ key: "dtg", label: "DTG printing" }, { key: "embroidery", label: "Embroidery" }]}
          placements={[{ key: "front", label: "Front print", technique: "dtg", size: "1800 × 2400 px" }, { key: "embroidery_chest_left", label: "Left chest", technique: "embroidery" }]}
          defaults={{ title: "Unisex Tee" }}
          onPlan={onPlan}
          onSubmit={onSubmit}
        />,
      ),
    );
    expect((container.querySelector("input[id$=-slug]") as HTMLInputElement).value).toBe("unisex-tee");
    expect(container.textContent).toContain("Front print (1800 × 2400 px)");
    expect(container.textContent).not.toContain("Left chest");

    await click(byText("Work out costs"));
    expect(container.querySelector("[role=alert]")!.textContent).toBe("Choose at least one colour.");
    await click(container.querySelector<HTMLInputElement>("[data-color=Black] input")!);
    await type(container.querySelector<HTMLInputElement>("input[id$=-price]")!, "12");
    await type(container.querySelector<HTMLInputElement>("input[aria-label='2XL upcharge']")!, "3");
    await click(byText("Work out costs"));
    expect(onPlan).toHaveBeenLastCalledWith(expect.objectContaining({ colors: ["Black"], sizes: ["S", "2XL"], retailCents: 1200, sizeUpchargeCents: { "2XL": 300 }, technique: "dtg", files: [] }));
    const margins = [...container.querySelectorAll("[data-margin]")].map((td) => td.textContent);
    expect(margins).toEqual(["-$1.00", "$2.00"]);

    await type(container.querySelector<HTMLInputElement>("input[id$=-file-front]")!, "https://art.example/front.png");
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Unisex Tee", slug: "unisex-tee", files: [{ placement: "front", url: "https://art.example/front.png" }] }));
    expect(container.querySelector("[role=status]")!.textContent).toContain("Created Tee");
  });

  it("can be shown but not submitted", async () => {
    const onSubmit = vi.fn();
    await act(async () => root.render(<BringOverForm colors={[]} sizes={[]} techniques={[]} placements={[]} onPlan={vi.fn()} onSubmit={onSubmit} disabledReason="Needs PRINTFUL_API_TOKEN." />));
    expect(byText("Bring over").disabled).toBe(true);
    expect(container.textContent).toContain("Needs PRINTFUL_API_TOKEN.");
  });
});
