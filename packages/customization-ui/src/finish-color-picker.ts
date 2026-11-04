import { availableColorChoices, getFinishTier, isRegionLocked, resolveEffectiveColor } from "./resolve.js";
import type { ColorSelection, CustomizableProduct, FinishTier, PaletteColor } from "./types.js";

/**
 * <ml-finish-color-picker> -- the default, out-of-the-box UI for a
 * product's finish + color customization. A real Custom Element (not a
 * framework component), so it embeds into React, Angular, Vue or a plain
 * page with zero framework-specific build step -- same pattern
 * @google/model-viewer already proves out live in shop.mdostal.com's PDPs.
 *
 * No persistence, no network calls: this package renders state and emits
 * events, nothing more. A discontinued option stays visible (greyed out,
 * disabled) rather than disappearing; a request-only option gets a dashed
 * swatch/card plus a "Request this" affordance that fires `ml-request`,
 * for the host app to wire to its own lead-capture backend (shop-5c's
 * customization package owns that capture mechanism server-side -- this
 * element only asks for it).
 *
 * Usage:
 *   const el = document.createElement("ml-finish-color-picker");
 *   el.palette = [...]; el.finishes = [...]; el.product = {...};
 *   el.value = { finishId: "solid", colors: { __all: "#1F5FD0" } };
 *   el.addEventListener("ml-change", (e) => { ...e.detail.value... });
 *   el.addEventListener("ml-request", (e) => { ...e.detail (kind/id)... });
 *   document.body.append(el);
 */
export class FinishColorPickerElement extends HTMLElement {
  #palette: PaletteColor[] = [];
  #finishes: FinishTier[] = [];
  #product: CustomizableProduct | null = null;
  #value: ColorSelection = { finishId: "", colors: {} };
  #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get palette(): PaletteColor[] {
    return this.#palette;
  }
  set palette(v: PaletteColor[]) {
    this.#palette = v;
    this.#render();
  }

  get finishes(): FinishTier[] {
    return this.#finishes;
  }
  set finishes(v: FinishTier[]) {
    this.#finishes = v;
    this.#render();
  }

  get product(): CustomizableProduct | null {
    return this.#product;
  }
  set product(v: CustomizableProduct | null) {
    this.#product = v;
    this.#render();
  }

  get value(): ColorSelection {
    return this.#value;
  }
  set value(v: ColorSelection) {
    this.#value = v;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #emitChange() {
    this.dispatchEvent(new CustomEvent("ml-change", { detail: { value: this.#value }, bubbles: true, composed: true }));
  }

  #emitRequest(kind: "finish" | "color", id: string) {
    this.dispatchEvent(new CustomEvent("ml-request", { detail: { kind, id, productId: this.#product?.id }, bubbles: true, composed: true }));
  }

  #setFinish(finishId: string) {
    this.#value = { finishId, colors: this.#value.colors };
    this.#emitChange();
  }

  #setColor(regionId: string, hex: string) {
    this.#value = { ...this.#value, colors: { ...this.#value.colors, [regionId]: hex } };
    this.#emitChange();
  }

  #render() {
    const product = this.#product;
    if (!product) {
      this.#root.innerHTML = "";
      return;
    }
    const activeFinish = getFinishTier(this.#finishes, this.#value.finishId);
    const style = `
      :host { display: block; font-family: var(--ml-font-body, system-ui, sans-serif); color: var(--ml-text, #1c140d); }
      .tier { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--ml-border, #e3d2b8); cursor: pointer; margin-bottom: 6px; }
      .tier[data-active="true"] { border-color: var(--ml-primary, #ff6b00); }
      .tier[data-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
      .tier[data-request="true"] { border-style: dashed; }
      .tier .meta { display: flex; gap: 8px; align-items: baseline; }
      .tier .delta { font-size: 12px; font-family: var(--ml-font-mono, monospace); color: var(--ml-text-muted, #6f5c48); }
      .tier .desc { font-size: 12px; color: var(--ml-text-muted, #6f5c48); display: block; }
      .tier .note { font-size: 11px; color: var(--ml-primary, #ff6b00); display: block; margin-top: 2px; }
      .region { margin-top: 12px; }
      .region .label { font-size: 13px; display: block; margin-bottom: 4px; }
      .swatches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--ml-border, #e3d2b8); cursor: pointer; padding: 0; position: relative; }
      .swatch[data-active="true"] { border-color: var(--ml-text, #1c140d); }
      .swatch[data-disabled="true"] { opacity: 0.35; cursor: not-allowed; }
      .swatch[data-request="true"] { border-style: dashed; }
      .request-link { font-size: 11px; background: none; border: none; color: var(--ml-primary, #ff6b00); text-decoration: underline; cursor: pointer; padding: 0; }
      .locked-note { font-size: 12px; color: var(--ml-text-muted, #6f5c48); }
    `;

    const finishList = product.finishes
      .map((id) => getFinishTier(this.#finishes, id))
      .filter((f): f is FinishTier => Boolean(f));

    const finishHtml = finishList
      .map((f) => {
        const disabled = f.status === "discontinued";
        const request = f.status === "request";
        const active = f.id === this.#value.finishId;
        const deltaLabel = f.priceDeltaCents ? `+$${(f.priceDeltaCents / 100).toFixed(2)}` : "included";
        return `
          <label class="tier" data-active="${active}" data-disabled="${disabled}" data-request="${request}">
            <input type="radio" name="finish" value="${f.id}" ${active ? "checked" : ""} ${disabled ? "disabled" : ""} />
            <div>
              <div class="meta"><strong>${f.label}</strong><span class="delta">${request ? "on request" : disabled ? "no longer offered" : deltaLabel}</span></div>
              <span class="desc">${f.description}</span>
              ${f.note ? `<span class="note">${f.note}</span>` : ""}
              ${request ? `<button type="button" class="request-link" data-request-finish="${f.id}">Request this finish</button>` : ""}
            </div>
          </label>
        `;
      })
      .join("");

    const regionsHtml = activeFinish
      ? activeFinish.colors === "single"
        ? this.#renderSwatchRow({ id: "__all", label: "Color", default: product.regions[0]?.default ?? "#141414", separable: true }, activeFinish)
        : product.regions
            .map((region) => {
              if (isRegionLocked(this.#value.finishId, region)) {
                const parent = product.regions.find((r) => r.id === region.parent);
                return `<div class="region"><span class="label">${region.label}</span><span class="locked-note">Too small to print separately, matches ${parent?.label.toLowerCase() ?? "its parent"} in this finish.</span></div>`;
              }
              return `<div class="region"><span class="label">${region.label}</span>${this.#renderSwatchRow(region, activeFinish)}</div>`;
            })
            .join("")
      : "";

    this.#root.innerHTML = `<style>${style}</style><div class="finishes">${finishHtml}</div><div class="regions">${regionsHtml}</div>`;

    this.#root.querySelectorAll<HTMLInputElement>('input[name="finish"]').forEach((input) => {
      input.addEventListener("change", () => this.#setFinish(input.value));
    });
    this.#root.querySelectorAll<HTMLButtonElement>("[data-request-finish]").forEach((btn) => {
      btn.addEventListener("click", () => this.#emitRequest("finish", btn.dataset.requestFinish ?? ""));
    });
    this.#root.querySelectorAll<HTMLButtonElement>("[data-swatch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const regionId = btn.dataset.region ?? "";
        const colorId = btn.dataset.swatch ?? "";
        if (btn.dataset.disabled === "true") return;
        if (btn.dataset.requestColor === "true") {
          this.#emitRequest("color", colorId);
          return;
        }
        const hex = btn.dataset.hex ?? "";
        this.#setColor(regionId, hex);
      });
    });
  }

  #renderSwatchRow(region: { id: string; label: string; default: string; separable: boolean; allowed?: string[] }, finish: FinishTier): string {
    const current = this.#value.colors[region.id] ?? region.default;
    const { list } = availableColorChoices(this.#palette, finish, region as never);
    return `<div class="swatches">${list
      .map((p) => {
        const disabled = p.status === "discontinued";
        const request = p.status === "request";
        const active = p.hex.toLowerCase() === current.toLowerCase();
        return `<button type="button" class="swatch" title="${p.label}${p.note ? " -- " + p.note : ""}" style="background:${p.hex}" data-swatch="${p.id}" data-region="${region.id}" data-hex="${p.hex}" data-active="${active}" data-disabled="${disabled}" data-request="${request}" data-request-color="${request}"></button>`;
      })
      .join("")}</div>`;
  }
}

export function defineFinishColorPicker(tagName = "ml-finish-color-picker"): void {
  if (!customElements.get(tagName)) customElements.define(tagName, FinishColorPickerElement);
}
