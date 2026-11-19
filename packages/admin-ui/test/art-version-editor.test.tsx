// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtVersionEditor, RatingsTable, summarizeScores, type ArtVersionEditorProps, type RatingRow } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Copy = { headline: string; close: string; template: string };

const BASE: Copy = { headline: "Your CTO, part-time.", close: "Scan me.", template: "card" };
const VERSIONS = [
  { version: 1, note: "launch", copy: BASE, previewUrl: "/files/card-v1.png" },
  { version: 2, note: "panel pick", copy: { ...BASE, close: "Let's talk." } },
];
const FIELDS = [
  { key: "headline", label: "Headline", max: 24 },
  { key: "close", label: "Call to action", max: 20, hint: "Handwritten" },
];

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

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}
function editor(props: Partial<ArtVersionEditorProps<Copy>> = {}) {
  return (
    <ArtVersionEditor<Copy>
      artId="card"
      fields={FIELDS}
      base={BASE}
      pin={1}
      versions={VERSIONS}
      preview={(c) => <output data-preview>{`${c.headline} | ${c.close}`}</output>}
      onSave={async () => {}}
      {...props}
    />
  );
}
const $ = <E extends Element>(sel: string) => container.querySelector<E>(sel)!;
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;
async function type(id: string, value: string) {
  const input = $<HTMLInputElement>(`#${id}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(el: HTMLElement) {
  await act(async () => el.click());
}

describe("ArtVersionEditor", () => {
  it("previews live as the owner types and counts characters against each limit", async () => {
    await render(editor());
    expect($("[data-preview]").textContent).toBe("Your CTO, part-time. | Scan me.");
    expect($("[data-count=close]").textContent).toBe("8/20");
    await type("card-close", "Hire my dad");
    expect($("[data-preview]").textContent).toBe("Your CTO, part-time. | Hire my dad");
    expect($("[data-count=close]").textContent).toBe("11/20");
    expect(button("Save as version 3")).toBeTruthy();
  });

  it("refuses to save while a field is too long, naming it", async () => {
    const onSave = vi.fn();
    await render(editor({ onSave }));
    await type("card-headline", "A headline far too long to print");
    expect($("[role=alert]").textContent).toBe("Too long to print: Headline.");
    expect(button("Save as version").disabled).toBe(true);
    await act(async () => $<HTMLFormElement>("form").requestSubmit());
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the edited copy with the note, keeping fields it does not edit", async () => {
    const onSave = vi.fn(async () => {});
    await render(editor({ onSave }));
    await type("card-close", "Let's build.");
    await type("card-note", "  shorter  ");
    await click(button("Save as version 3"));
    expect(onSave).toHaveBeenCalledWith({ headline: "Your CTO, part-time.", close: "Let's build.", template: "card" }, "shorter");
    expect($("[role=status]").textContent).toBe("Saved as version 3.");
    expect($<HTMLInputElement>("#card-note").value).toBe("");
  });

  it("shows a save error from a result or a throw", async () => {
    await render(editor({ onSave: async () => ({ ok: false, error: "Not allowed." }) }));
    await click(button("Save as version"));
    expect($("[role=alert]").textContent).toBe("Not allowed.");
    await render(editor({ onSave: async () => { throw new Error("Database down."); } }));
    await click(button("Save as version"));
    expect($("[role=alert]").textContent).toBe("Database down.");
  });

  it("lists versions with the pinned one marked, edits from one, and resets to the pinned copy", async () => {
    await render(editor({ pinHelp: (v) => <span data-help>{`set the pin to ${v}`}</span> }));
    expect($("[data-version='1'] [data-pinned]").textContent).toBe("on the store");
    expect($("[data-version='2'] [data-pinned]")).toBeNull();
    expect($("[data-version='1'] [data-help]")).toBeNull();
    expect($("[data-version='2'] [data-help]").textContent).toBe("set the pin to 2");
    expect($<HTMLImageElement>("[data-version='1'] img").getAttribute("src")).toBe("/files/card-v1.png");
    await click($<HTMLButtonElement>("[data-version='2'] button"));
    expect($("[data-preview]").textContent).toBe("Your CTO, part-time. | Let's talk.");
    await click(button("Reset to pinned"));
    expect($("[data-preview]").textContent).toBe("Your CTO, part-time. | Scan me.");
  });

  it("orders a sample of a version on the chosen target, and hides ordering without a handler", async () => {
    const onOrderSample = vi.fn(async () => {});
    const targets = [{ value: "tee|L", label: "Tee, L" }, { value: "hoodie|M", label: "Hoodie, M" }];
    await render(editor({ onOrderSample, sampleTargets: targets, sampleLabel: "Order sample · $1" }));
    const select = $<HTMLSelectElement>("#card-v2-target");
    await act(async () => {
      select.value = "hoodie|M";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click([...$("[data-version='2']").querySelectorAll("button")].find((b) => b.textContent === "Order sample · $1")!);
    expect(onOrderSample).toHaveBeenCalledWith(2, "hoodie|M");
    expect($("[data-version='2'] [role=status]").textContent).toBe("Sample ordered.");

    await render(editor());
    expect(container.textContent).not.toContain("Order sample");
  });

  it("can be filled from a ratings table when its copy is controlled", async () => {
    const rows: RatingRow[] = [
      { id: "a", label: "Scan me.", mean: 6.1, sd: 1.2, min: 4, max: 8, reasons: [{ rater: "CTO", score: 6, reason: "fine" }] },
      { id: "b", label: "Let's build.", mean: 7.4, sd: 0.9, min: 6, max: 9, reasons: [] },
    ];
    function Page() {
      const [copy, setCopy] = useState(BASE);
      return (
        <>
          {editor({ copy, onCopyChange: setCopy })}
          <RatingsTable rows={rows} onUse={(row) => setCopy({ ...copy, close: String(row.label) })} />
        </>
      );
    }
    await render(<Page />);
    await click([...container.querySelectorAll("[data-row='b'] button")][0] as HTMLButtonElement);
    expect($("[data-preview]").textContent).toBe("Your CTO, part-time. | Let's build.");
    await type("card-headline", "Part-time CTO");
    expect($("[data-preview]").textContent).toBe("Part-time CTO | Let's build.");
  });
});

describe("RatingsTable", () => {
  it("ranks rows by mean, shows spread and range, and lists reasons highest score first", async () => {
    const rows: RatingRow[] = [
      { id: "low", label: "Low", mean: 5, sd: 2, min: 1, max: 9, reasons: [{ rater: "A", score: 3, reason: "meh" }, { rater: "B", score: 7, reason: "ok" }] },
      { id: "high", label: "High", mean: 7.25, sd: 0.5, min: 7, max: 8, reasons: [{ rater: "A", score: 7, reason: "good" }] },
    ];
    await render(<RatingsTable rows={rows} caption="30 personas, 1 to 10." />);
    const ids = [...container.querySelectorAll("details")].map((d) => d.getAttribute("data-row"));
    expect(ids).toEqual(["high", "low"]);
    expect($("[data-row=high] summary").textContent).toContain("7.3");
    expect($("[data-row=high] summary").textContent).toContain("#1 · spread 0.5 · range 7–8 · 1 rating");
    expect([...container.querySelectorAll("[data-row=low] td:nth-child(2)")].map((t) => t.textContent)).toEqual(["B", "A"]);
    expect(container.textContent).toContain("30 personas, 1 to 10.");
    expect(container.querySelector("button")).toBeNull();
  });

  it("summarizes scores", () => {
    expect(summarizeScores([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ mean: 5, sd: 2, min: 2, max: 9 });
    expect(summarizeScores([])).toEqual({ mean: 0, sd: 0, min: 0, max: 0 });
  });
});
