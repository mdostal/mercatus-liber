"use client";

import type { ThemeBundle } from "@mercatus-liber/theming";
import { useRef } from "react";
import { setThemeAction } from "../lib/actions";
import type { DemoSlug } from "../lib/demos";

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
              {bundle.label}
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
