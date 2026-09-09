"use client";

import type { ThemeBundle } from "@mercatus-liber/theming";
import { useRef } from "react";
import { setThemeAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

/**
 * The 3 storefront-design-system-v2 bundles carry real design names (from the
 * source design that was live-verified and published as an Artifact before this
 * epic's planning pass -- see .pHive/epics/storefront-design-system-v2/docs/
 * design-discussion.md §1) that read better than their generic ThemeBundle.label
 * ("Editorial"/"Maximalist"/"Datasheet"). This map is presentation-only sugar
 * over the existing label -- it does not change ThemeBundle.label itself (which
 * stays the short, generic form other call sites/tests already assert on), and
 * it does not add any new persistence path: selecting any option here still
 * just writes bundle.key via the same setThemeAction/theme-cookie mechanism
 * every other bundle already uses.
 */
const DESIGN_NAMES: Partial<Record<string, string>> = {
  editorial: "The Slow Catalog",
  maximalist: "Blaze Theme",
  datasheet: "Datasheet Storefront",
};

export function ThemeSwitcher({
  demoSlug,
  bundles,
  activeKey,
}: {
  demoSlug: DemoSlug;
  bundles: ThemeBundle[];
  activeKey: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={setThemeAction} ref={formRef} style={{ marginTop: 8 }}>
      <input type="hidden" name="demoSlug" value={demoSlug} />
      <label>
        Theme:{" "}
        <select name="theme" defaultValue={activeKey} onChange={() => formRef.current?.requestSubmit()}>
          {bundles.map((bundle) => (
            <option key={bundle.key} value={bundle.key}>
              {DESIGN_NAMES[bundle.key] ?? bundle.label} ({bundle.key})
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit">Apply</button>
      </noscript>
    </form>
  );
}
