"use client";

import { useRef } from "react";
import type { OptionValues } from "@mercatus-liber/pdp";

/**
 * product-configurator epic (pc-01): the real interactive variant-picker --
 * one real `<select>` per identifying-attribute key (viewModel.optionValues),
 * never a click-div-only control, so it stays keyboard-operable and
 * accessible for free. Only ever rendered by a PDP template when the product
 * has 2+ SKUs (see each template's own `skus.length > 1` guard) -- a
 * single-SKU product never mounts this component at all, which is how the
 * "byte-identical for a single SKU" regression boundary holds.
 *
 * Same GET-navigation pattern as theme-switcher.tsx: each `<select>`
 * auto-submits the form via `requestSubmit()` on change (progressive
 * enhancement), with a `<noscript>` submit button so selection still works
 * with client JS disabled -- "works without client JS for the base case" per
 * this story's own acceptance criteria. Submitting re-requests the current
 * PDP path with the new selection as query params
 * (`?color=navy&size=medium`); the PDP route
 * (app/demo/[demoSlug]/products/[slug]/page.tsx) reads those params and
 * resolves them to exactly one SKU via `pdp.resolveSelection` -- the real,
 * live call site this story gives that previously-dead delegate to
 * `catalog.resolveVariant`. That server-side resolution (not any client-side
 * re-implementation of SKU matching) is what decides the shown price/stock/
 * Add-to-cart target, so this component itself has zero matching logic.
 */
export function VariantPicker({
  basePath,
  optionValues,
  selection,
}: {
  basePath: string;
  optionValues: OptionValues[];
  /** Current value per identifying-attribute key, always fully populated by the page (the exact combination backing the currently-shown SKU) -- never partial, so every `<select>` always has a real defaultValue and nothing renders in a blank/unselected state. */
  selection: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form method="get" action={basePath} ref={formRef} className="vp-form">
      <style>{VARIANT_PICKER_CSS}</style>
      {optionValues.map((option) => (
        <label className="vp-field" key={option.key}>
          <span className="vp-label">{option.key}</span>
          <select
            className="vp-select"
            name={option.key}
            defaultValue={selection[option.key]}
            onChange={() => formRef.current?.requestSubmit()}
            aria-label={`Select ${option.key}`}
          >
            {option.values.map((value) => (
              <option key={String(value)} value={String(value)}>
                {String(value)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <noscript>
        <button type="submit" className="vp-apply">
          Update selection
        </button>
      </noscript>
    </form>
  );
}

const VARIANT_PICKER_CSS = `
  .vp-form { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; }
  .vp-field { display: flex; flex-direction: column; gap: 4px; font-family: var(--font-family, inherit); }
  .vp-label { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted, #666); }
  .vp-select {
    border: 1px solid var(--color-border, #ccc);
    border-radius: var(--radius, 4px);
    background: var(--color-background);
    color: var(--color-text);
    padding: 6px 10px;
    font-family: inherit;
    font-size: 0.9rem;
  }
  .vp-select:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  .vp-apply { margin-left: 4px; font-family: inherit; font-size: 0.85rem; }
`;
