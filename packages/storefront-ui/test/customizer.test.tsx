// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LineInput, PaletteColor, ProductCustomization, FinishTier } from "@mercatus-liber/customization/client";
import { Customizer, type QuoteResult } from "../src/customizer.js";
import { PriceBreakdown, formatMoney } from "../src/price-breakdown.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PALETTE: PaletteColor[] = [
  { id: "black", label: "Black", hex: "#141414" },
  { id: "red", label: "Red", hex: "#C12E1F" },
  { id: "pink", label: "Pink", hex: "#F55A74", status: "request" },
  { id: "old", label: "Old", hex: "#111111", status: "discontinued" },
];
const FINISHES: FinishTier[] = [
  { id: "solid", rank: 1, label: "One color", colors: "single", description: "", producesSeparateParts: false },
  { id: "multi", rank: 2, label: "Multicolor", colors: "palette", description: "", producesSeparateParts: false },
  { id: "painted", rank: 3, label: "Painted", colors: "any", description: "", producesSeparateParts: false },
];
const PRODUCT: ProductCustomization = {
  id: "c1",
  productId: "p1",
  finishIds: ["multi", "solid", "painted"],
  regions: [
    { id: "body", label: "Body", defaultHex: "#141414", separable: true },
    { id: "lock", label: "Lock", defaultHex: "#141414", separable: true, when: { lock: ["hasp"] } },
  ],
  options: [
    { id: "lock", label: "Lock", choices: [{ id: "none", label: "None" }, { id: "hasp", label: "Hasp" }, { id: "metal", label: "Metal", status: "request" }] },
    { id: "style", label: "Style", when: { lock: "hasp" }, choices: [{ id: "plain", label: "Plain" }, { id: "fancy", label: "Fancy", only: { lock: "metal" } }] },
  ],
  variants: {
    key: "lock",
    rows: [
      { id: "none", label: "None", when: { lock: "none" } },
      { id: "hasp", label: "Hasp", when: { lock: "hasp" } },
      { id: "metal", label: "Metal", when: { lock: "metal" } },
    ],
  },
};

describe("Customizer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let quote: ReturnType<typeof vi.fn<(input: LineInput) => Promise<QuoteResult>>>;
  let addToCart: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    quote = vi.fn(async () => ({ ok: true as const, lines: [{ id: "base", label: "Base price", amount: 1000 }], total: 1000, quoteRequired: false }));
    addToCart = vi.fn(async () => ({ ok: true }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
  }

  async function render(props: Partial<Parameters<typeof Customizer>[0]> = {}): Promise<void> {
    await act(async () => {
      root.render(<Customizer palette={PALETTE} finishes={FINISHES} customization={PRODUCT} currency="USD" quote={quote} addToCart={addToCart} nameLabel="Name" {...props} />);
    });
    await settle();
  }

  const lastInput = (): LineInput => quote.mock.calls.at(-1)![0];
  const button = (label: string): HTMLButtonElement => {
    const found = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent)?.startsWith(label));
    if (!found) throw new Error(`No button ${label}`);
    return found;
  };
  async function click(label: string): Promise<void> {
    await act(async () => button(label).click());
    await settle();
  }

  it("starts valid, and quotes in palette ids without sending any price", async () => {
    await render();
    expect(lastInput()).toEqual({ finish: "multi", selection: { body: "black" }, picks: { lock: "none" } });
    expect(container.querySelector('[data-testid="price-total"]')!.textContent).toBe("$10.00");
  });

  it("re-quotes when a color changes", async () => {
    await render();
    await click("Red");
    expect(lastInput().selection.body).toBe("red");
  });

  it("🔍 shows a region and an option only for the version that has them", async () => {
    await render();
    expect(container.textContent).not.toContain("Style");
    await click("Hasp");
    expect(container.textContent).toContain("Style");
    expect(lastInput().selection).toEqual({ body: "black", lock: "black" });
    expect(lastInput().picks).toEqual({ lock: "hasp", style: "plain" });
  });

  it("🔍 disables a choice whose only isn't met, and a discontinued color", async () => {
    await render();
    await click("Hasp");
    expect(button("Fancy").disabled).toBe(true);
    expect(button("Old").disabled).toBe(true);
  });

  it("🔍 uses one whole-piece color under a one-color finish, and keeps the chosen color when switching", async () => {
    await render();
    await click("Red");
    await click("One color");
    expect(lastInput().selection).toEqual({ __all: "black" });
    await click("Multicolor");
    expect(lastInput().selection).toEqual({ body: "red" });
  });

  it("offers a free color only on a free-color finish", async () => {
    await render();
    expect(container.querySelector('input[type="color"]')).toBeNull();
    await click("Painted");
    expect(container.querySelector('input[type="color"]')).not.toBeNull();
  });

  it("🔍 a slow older quote can't overwrite a newer one", async () => {
    let finishFirst!: (value: QuoteResult) => void;
    quote.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    await render();
    quote.mockImplementationOnce(async () => ({ ok: true, lines: [{ id: "base", label: "Base", amount: 2000 }], total: 2000, quoteRequired: false }));
    await click("Red");
    await act(async () => finishFirst({ ok: true, lines: [{ id: "base", label: "Base", amount: 1000 }], total: 1000, quoteRequired: false }));
    expect(container.querySelector('[data-testid="price-total"]')!.textContent).toBe("$20.00");
  });

  it("🔍 blocks buying until priced, on a pricing error, and when a quote is needed", async () => {
    quote.mockImplementationOnce(async () => ({ ok: false, error: "Nope" }));
    await render();
    expect(container.textContent).toContain("Nope");
    expect(button("Add to cart").disabled).toBe(true);
    quote.mockImplementation(async () => ({ ok: true, lines: [{ id: "base", label: "Base", amount: 1000 }], total: 1000, quoteRequired: true }));
    await click("Metal");
    expect(button("Needs a quote").disabled).toBe(true);
  });

  it("adds the current choices and quantity, and shows a server refusal", async () => {
    await render();
    await act(async () => container.querySelector("form")!.requestSubmit());
    await settle();
    expect(addToCart).toHaveBeenCalledWith({ finish: "multi", selection: { body: "black" }, picks: { lock: "none" } }, 1);
    expect(container.textContent).toContain("Added to your cart.");
    addToCart.mockImplementationOnce(async () => ({ ok: false, error: "Sold out" }));
    await act(async () => container.querySelector("form")!.requestSubmit());
    await settle();
    expect(container.textContent).toContain("Sold out");
  });
});

describe("PriceBreakdown", () => {
  it("🔍 sizes bar segments by share, leaves a discount off the bar but in the list", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() =>
      root.render(
        <PriceBreakdown
          currency="USD"
          total={1100}
          lines={[
            { id: "base", label: "Base", amount: 1000 },
            { id: "color", label: "Color", amount: 250 },
            { id: "sale", label: "Sale", amount: -150 },
          ]}
        />,
      ),
    );
    const segments = [...container.querySelectorAll<HTMLElement>("[data-line]")];
    expect(segments.map((s) => s.dataset.line)).toEqual(["base", "color"]);
    expect(segments.map((s) => s.style.flexGrow)).toEqual(["0.8", "0.2"]);
    expect(container.textContent).toContain("Sale");
    expect(container.textContent).toContain("-$1.50");
    act(() => root.unmount());
  });

  it("formats money", () => {
    expect(formatMoney(8300, "USD")).toBe("$83.00");
  });
});
