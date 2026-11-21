// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artFitWarning, PlacementArtEditor, PlacementPreview, type PlacementTemplate } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Printful product 71's outside-label template, read live on 2026-11-20.
const TEMPLATE: PlacementTemplate = { imageUrl: "https://files.cdn.printful.com/m/templates/medium/outside_label_3x3.png", backgroundColor: "#008db5", templateWidth: 560, templateHeight: 560, printArea: { top: 187, left: 137, width: 288, height: 288 }, positioning: "background" };

describe("artFitWarning", () => {
  it("accepts art at the print area's size and shape, and explains anything else", () => {
    expect(artFitWarning({ width: 1800, height: 2400 }, { width: 1800, height: 2400 })).toBeNull();
    expect(artFitWarning({ width: 1200, height: 1600 }, { width: 1800, height: 2400 })).toMatch(/smaller.*may print soft/);
    expect(artFitWarning({ width: 2000, height: 2000 }, { width: 1800, height: 2400 })).toMatch(/different shape/);
  });
});

describe("PlacementPreview and PlacementArtEditor", () => {
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

  it("puts the art exactly over the print area, under an overlay template and over a background one", async () => {
    await act(async () => root.render(<PlacementPreview template={TEMPLATE} artUrl="https://art.example/label.png" printAreaPx={{ width: 450, height: 450 }} label="Outside label" />));
    const art = container.querySelector<HTMLImageElement>("[data-art]")!;
    expect(art.style.left).toBe(`${(137 / 560) * 100}%`);
    expect(art.style.width).toBe(`${(288 / 560) * 100}%`);
    expect(art.style.zIndex).toBe("2");
    expect(container.querySelector<HTMLImageElement>("[data-template]")!.style.zIndex).toBe("1");
    Object.defineProperty(art, "naturalWidth", { value: 300 });
    Object.defineProperty(art, "naturalHeight", { value: 300 });
    await act(async () => art.dispatchEvent(new Event("load")));
    expect(container.querySelector("[role=alert]")!.textContent).toMatch(/300 × 300 px, smaller than the 450 × 450/);
    await act(async () => root.render(<PlacementPreview template={{ ...TEMPLATE, positioning: "overlay" }} artUrl="https://art.example/x.png" label="Front" />));
    expect(container.querySelector<HTMLImageElement>("[data-art]")!.style.zIndex).toBe("1");
    expect(container.querySelector<HTMLImageElement>("[data-template]")!.style.zIndex).toBe("2");
  });

  it("saves and removes the art", async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }));
    const onRemove = vi.fn(async () => ({ ok: true as const }));
    await act(async () => root.render(<PlacementArtEditor template={TEMPLATE} label="Outside label" artUrl="https://art.example/old.png" onSave={onSave} onRemove={onRemove} />));
    const input = container.querySelector<HTMLInputElement>("input[type=url]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://art.example/new.png");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector<HTMLImageElement>("[data-art]")!.getAttribute("src")).toBe("https://art.example/new.png");
    const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === text)!;
    await act(async () => button("Save art").click());
    expect(onSave).toHaveBeenCalledWith("https://art.example/new.png");
    expect(container.querySelector("[role=status]")!.textContent).toContain("Saved");
    await act(async () => button("Remove").click());
    expect(onRemove).toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("uploads a file, refusing one over the limit, and shows the saved URL as the art", async () => {
    const onUpload = vi.fn(async (data: FormData) => ({ ok: true as const, url: `https://store.example/media/${(data.get("file") as File).name}` }));
    await act(async () => root.render(<PlacementArtEditor template={TEMPLATE} label="Front" onSave={vi.fn()} onUpload={onUpload} maxUploadBytes={10} />));
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    const choose = async (file: File) =>
      act(async () => {
        Object.defineProperty(input, "files", { value: [file], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await choose(new File([new Uint8Array(20)], "big.png", { type: "image/png" }));
    expect(container.querySelector("[role=alert]")!.textContent).toMatch(/limit/);
    expect(onUpload).not.toHaveBeenCalled();
    await choose(new File([new Uint8Array(5)], "art.png", { type: "image/png" }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLImageElement>("[data-art]")!.getAttribute("src")).toBe("https://store.example/media/art.png");
    expect(container.querySelector("[role=status]")!.textContent).toContain("Uploaded and saved");
  });
});
