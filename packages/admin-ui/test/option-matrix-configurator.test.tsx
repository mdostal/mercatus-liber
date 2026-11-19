// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptionMatrixConfigurator, PrintCoverage, resolveMatrixSelection, type MatrixOption, type OptionMatrixConfiguratorProps } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COLORWAYS: Record<string, string[]> = { r2: ["dark", "light"], forge: ["dark"] };
const OPTIONS: MatrixOption[] = [
  {
    key: "design",
    label: "Design",
    values: [
      { id: "r2", label: "R2", description: "On the store." },
      { id: "forge", label: "Forge", badge: "drop", description: "Drop: Dec 1." },
      { id: "old", label: "Old", disabled: true },
    ],
  },
  {
    key: "color",
    label: "Color",
    values: (s) =>
      [
        { id: "black", label: "Black", swatch: "#111", colorway: "dark" },
        { id: "white", label: "White", swatch: "#fff", colorway: "light" },
      ]
        .filter((c) => COLORWAYS[s.design ?? ""]?.includes(c.colorway))
        .map(({ colorway: _c, ...v }) => v),
  },
  { key: "size", label: "Size", values: ["S", "M", "L"].map((id) => ({ id, label: id })) },
  { key: "backSize", label: "Back size", values: [{ id: "large", label: "Large back, 15 x 18 in" }], hideWhenSingle: true },
  { key: "back", label: "Back", values: (s) => (s.color === "white" ? [] : [{ id: "none", label: "None" }, { id: "card", label: "Card", badge: "internal" }]) },
];

describe("resolveMatrixSelection", () => {
  it("keeps valid choices, moves dependent options to their first available value, and drops empty options", () => {
    expect(resolveMatrixSelection(OPTIONS, {}).selection).toEqual({ design: "r2", color: "black", size: "S", backSize: "large", back: "none" });
    expect(resolveMatrixSelection(OPTIONS, { design: "r2", color: "white", size: "L" }).selection).toEqual({ design: "r2", color: "white", size: "L", backSize: "large" });
    expect(resolveMatrixSelection(OPTIONS, { design: "forge", color: "white" }).selection.color).toBe("black");
    expect(resolveMatrixSelection(OPTIONS, { design: "old" }).selection.design).toBe("r2");
  });
});

describe("OptionMatrixConfigurator", () => {
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

  const render = async (props: Partial<OptionMatrixConfiguratorProps> = {}) =>
    act(async () =>
      root.render(
        <OptionMatrixConfigurator
          options={OPTIONS}
          images={(s) => [
            { url: `/front/${s.design}-${s.color}.png`, alt: "front", caption: "Front" },
            ...(s.back && s.back !== "none" ? [{ url: `/back/${s.back}-${s.color}.png`, alt: "back" }] : []),
          ]}
          aside={(s) => (s.back && s.back !== "none" ? <PrintCoverage garment={{ width: 22, length: 30 }} print={[15, 18]} size={s.size!} /> : null)}
          onAdd={async () => {}}
          {...props}
        />,
      ),
    );
  const $ = <E extends Element>(sel: string) => container.querySelector<E>(sel);
  const chip = (option: string, value: string) => $<HTMLButtonElement>(`[data-option=${option}] [data-value=${value}]`)!;
  const click = (el: HTMLElement) => act(async () => el.click());

  it("shows chips per option with badges, swatches and the chosen value's description, and hides single-value options when asked", async () => {
    await render();
    expect([...container.querySelectorAll("[data-option]")].map((g) => g.getAttribute("data-option"))).toEqual(["design", "color", "size", "back"]);
    expect(chip("design", "r2").getAttribute("aria-pressed")).toBe("true");
    expect(chip("design", "forge").textContent).toBe("Forge · drop");
    expect(chip("design", "old").disabled).toBe(true);
    expect($("[data-option=design]")!.textContent).toContain("On the store.");
    expect(chip("color", "black").querySelector("span")!.getAttribute("style")).toContain("background: rgb(17, 17, 17)");
  });

  it("updates dependent options and the images as choices change", async () => {
    const onChange = vi.fn();
    await render({ onChange });
    expect($<HTMLImageElement>("[data-image=main] img")!.getAttribute("src")).toBe("/front/r2-black.png");
    await click(chip("color", "white"));
    expect($("[data-option=back]")).toBeNull();
    await click(chip("design", "forge"));
    expect(chip("color", "black").getAttribute("aria-pressed")).toBe("true");
    expect($("[data-option=color] [data-value=white]")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({ design: "forge", color: "black", size: "S", backSize: "large", back: "none" });
    expect($("[data-option=design]")!.textContent).toContain("Drop: Dec 1.");
    await click(chip("back", "card"));
    expect($<HTMLImageElement>("[data-image=thumb] img")!.getAttribute("src")).toBe("/back/card-black.png");
    expect(container.querySelector("figcaption")!.textContent).toBe("Front");
    expect(container.textContent).toContain("Size S: garment 22 × 30 in flat.");
  });

  it("adds the current choices with a clamped quantity, and shows the result", async () => {
    const onAdd = vi.fn(async () => ({ ok: false as const, error: "Out of stock." }));
    await render({ onAdd, addLabel: "Add sample to cart · $1.00", maxQuantity: 5, initial: { size: "L" } });
    const qty = $<HTMLInputElement>("input[type=number]")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(qty, "9");
      qty.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(qty.value).toBe("5");
    const add = [...container.querySelectorAll("button")].find((b) => b.textContent === "Add sample to cart · $1.00")!;
    await click(add);
    expect(onAdd).toHaveBeenCalledWith({ design: "r2", color: "black", size: "L", backSize: "large", back: "none" }, 5);
    expect($("[role=alert]")!.textContent).toBe("Out of stock.");
  });
});
