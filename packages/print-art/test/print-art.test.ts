import { describe, expect, it } from "vitest";
import {
  ArtVersionTakenError,
  createArtVersionStore,
  createInMemorySavedArtVersionRepository,
  createPrintFileHandler,
  createPrintFileNaming,
  formatArtRef,
  invalidPins,
  layoutsAtDpi,
  overlongFields,
  parseArtRef,
  printCoverage,
  PRINT_FILE_CACHE_CONTROL,
  resolveArtVersion,
  UnknownArtError,
  type ArtVersion,
  type CodeArtVersions,
  type SavedArtVersionRepository,
} from "../src/index.js";
import { describeSavedArtVersionRepositoryContract } from "./saved-repository-contract.js";

type Copy = { headline: string; url?: string };

const CODE: CodeArtVersions<Copy> = {
  card: [{ version: 1, copy: { headline: "Tech help" }, note: "original" }],
  "team-kid": [
    { version: 1, copy: { headline: "My dad" }, note: "" },
    { version: 2, copy: { headline: "My dad builds" }, note: "" },
  ],
};

describeSavedArtVersionRepositoryContract("In-memory", async () => {
  const repo = createInMemorySavedArtVersionRepository<Copy>();
  return { open: () => repo };
});

describe("art versions", () => {
  it("lists code versions first and numbers saved ones after them, never changing one", async () => {
    const store = createArtVersionStore({ codeVersions: CODE });
    expect((await store.list("team-kid")).map((v) => v.version)).toEqual([1, 2]);
    const v3 = await store.save("team-kid", { headline: "Help my dad" }, "panel pick");
    expect(v3).toEqual({ version: 3, copy: { headline: "Help my dad" }, note: "panel pick" });
    expect((await store.get("team-kid", 3))?.copy.headline).toBe("Help my dad");
    expect((await store.get("team-kid", 1))?.copy.headline).toBe("My dad");
    expect(await store.get("team-kid", 9)).toBeNull();
  });

  it("refuses to save to art that has no code versions, and lists nothing for it", async () => {
    const store = createArtVersionStore({ codeVersions: CODE });
    await expect(store.save("nope", { headline: "x" }, "")).rejects.toBeInstanceOf(UnknownArtError);
    await expect(store.save("toString", { headline: "x" }, "")).rejects.toBeInstanceOf(UnknownArtError);
    expect(await store.list("nope")).toEqual([]);
    expect(store.isKnownArt("card")).toBe(true);
  });

  it("does not let a stored row shadow a code version of the same number", async () => {
    const saved = createInMemorySavedArtVersionRepository<Copy>();
    await saved.insert("card", { version: 1, copy: { headline: "impostor" }, note: "" });
    const store = createArtVersionStore({ codeVersions: CODE, saved });
    expect(await store.list("card")).toEqual([CODE.card![0]]);
  });

  it("retries once when another save took the number, then gives up", async () => {
    const inner = createInMemorySavedArtVersionRepository<Copy>();
    let collisions = 1;
    const racing: SavedArtVersionRepository<Copy> = {
      list: (artId) => inner.list(artId),
      async insert(artId, version) {
        if (collisions-- > 0) {
          await inner.insert(artId, { ...version, copy: { headline: "the other editor" } });
          throw new ArtVersionTakenError(artId, version.version);
        }
        await inner.insert(artId, version);
      },
    };
    const store = createArtVersionStore({ codeVersions: CODE, saved: racing });
    expect((await store.save("card", { headline: "mine" }, "")).version).toBe(3);
    expect((await store.list("card")).map((v) => v.copy.headline)).toEqual(["Tech help", "the other editor", "mine"]);

    const alwaysTaken: SavedArtVersionRepository<Copy> = { list: async () => [], insert: async (a, v) => { throw new ArtVersionTakenError(a, v.version); } };
    await expect(createArtVersionStore({ codeVersions: CODE, saved: alwaysTaken }).save("card", { headline: "x" }, "")).rejects.toBeInstanceOf(ArtVersionTakenError);
  });

  it("runs validate before saving, and reports overlong fields", async () => {
    const limits = { headline: 10 };
    const store = createArtVersionStore({
      codeVersions: CODE,
      validate: (_artId, copy: Copy) => {
        const problems = overlongFields(copy, limits);
        if (problems.length) throw new Error(`Too long: ${problems.map((p) => p.field).join(", ")}`);
      },
    });
    await expect(store.save("card", { headline: "Far too long a line" }, "")).rejects.toThrow(/Too long: headline/);
    expect(overlongFields({ headline: "Far too long a line", url: "a.com" }, limits)).toEqual([{ field: "headline", length: 19, max: 10 }]);
  });
});

describe("pins and art references", () => {
  const pins = { card: 1, "team-kid": 2 };

  it("parses and formats references", () => {
    expect(parseArtRef("team-kid@v3")).toEqual({ artId: "team-kid", version: 3 });
    expect(parseArtRef("card")).toEqual({ artId: "card", version: null });
    expect(formatArtRef("team-kid", 3)).toBe("team-kid@v3");
  });

  it("prints the pinned version on store products and any named version on samples", () => {
    expect(resolveArtVersion(parseArtRef("team-kid"), pins)).toBe(2);
    expect(resolveArtVersion(parseArtRef("team-kid@v2"), pins)).toBe(2);
    expect(resolveArtVersion(parseArtRef("team-kid@v3"), pins)).toBeNull();
    expect(resolveArtVersion(parseArtRef("team-kid@v3"), pins, { allowUnpinned: true })).toBe(3);
    expect(resolveArtVersion(parseArtRef("unpinned"), pins)).toBeNull();
  });

  it("finds pins that point at versions the code does not have", () => {
    expect(invalidPins(pins, CODE)).toEqual([]);
    expect(invalidPins({ card: 2, gone: 1 }, CODE)).toEqual([{ artId: "card", version: 2 }, { artId: "gone", version: 1 }]);
  });
});

describe("layouts and coverage", () => {
  const layouts = layoutsAtDpi({ "back-15x18": [15, 18], "back-11.5x13.8": [11.5, 13.8], "back-7x8": [7, 8] }, 150);

  it("works out print-file pixels at the given resolution", () => {
    expect(layouts["back-15x18"]).toEqual({ id: "back-15x18", inches: [15, 18], px: [2250, 2700] });
    expect(layouts["back-11.5x13.8"]!.px).toEqual([1725, 2070]);
    expect(() => layoutsAtDpi({ "Back 15": [15, 18] }, 150)).toThrow(/may use only/);
  });

  it("reports how much of a garment a print covers and whether it fits", () => {
    expect(printCoverage({ width: 22, length: 30 }, [15, 18])).toEqual({ widthPercent: 68, lengthPercent: 60, fits: true });
    expect(printCoverage({ width: 14.5, length: 15.625 }, [15, 18])).toMatchObject({ fits: false });
    expect(printCoverage({ width: 20, length: 20 }, [15, 18], 3).fits).toBe(false);
  });
});

describe("print files", () => {
  const layouts = layoutsAtDpi({ "back-15x18": [15, 18], "back-11.5x13.8": [11.5, 13.8], "back-7x8": [7, 8], "back-17x8": [17, 8] }, 150);
  const naming = createPrintFileNaming({ prefix: "/print-files/backs/", layouts });

  it("builds and parses names, refusing unknown layouts and anything else", () => {
    expect(naming.path("team-kid", 2, "back-15x18")).toBe("/print-files/backs/team-kid-v2-back-15x18.png");
    expect(naming.parse("team-kid-v12-back-11.5x13.8.png")).toEqual({ artId: "team-kid", version: 12, layout: "back-11.5x13.8" });
    expect(naming.parse("card-v1-back-17x8.png")).toEqual({ artId: "card", version: 1, layout: "back-17x8" });
    expect(naming.parse("card-v1-back-99x99.png")).toBeNull();
    expect(naming.parse("../etc-v1-back-15x18.png")).toBeNull();
    expect(naming.parse("card-v1-back-15x18.svg")).toBeNull();
    expect(naming.parse("card-back-15x18.png")).toBeNull();
    expect(() => naming.path("Card", 1, "back-15x18")).toThrow();
    expect(() => naming.path("card", 1, "back-1x1")).toThrow(/Unknown layout/);
  });

  it("serves an existing version at the layout's pixels with a year's cache, and 404s everything else", async () => {
    const store = createArtVersionStore({ codeVersions: CODE });
    const calls: [Copy, number, number][] = [];
    const handler = createPrintFileHandler({
      store,
      naming,
      layouts,
      render: async (copy, w, h) => {
        calls.push([copy, w, h]);
        return new Uint8Array([137, 80, 78, 71]);
      },
    });
    const ok = await handler("team-kid-v2-back-15x18.png");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("image/png");
    expect(ok.headers.get("Cache-Control")).toBe(PRINT_FILE_CACHE_CONTROL);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(calls).toEqual([[{ headline: "My dad builds" }, 2250, 2700]]);

    expect((await handler("team-kid-v9-back-15x18.png")).status).toBe(404);
    expect((await handler("nope-v1-back-15x18.png")).status).toBe(404);
    expect((await handler("team-kid-v2-back-1x1.png")).status).toBe(404);
    expect(calls).toHaveLength(1);
  });

  it("passes a renderer's Response body through", async () => {
    const store = createArtVersionStore({ codeVersions: CODE });
    const handler = createPrintFileHandler({ store, naming, layouts, render: async () => new Response(new Uint8Array([1, 2, 3])) });
    const res = await handler("card-v1-back-7x8.png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

// Keeps the exported type in use so a rename shows up here.
export type _V = ArtVersion<Copy>;

describe("layoutsFromPrintAreas", () => {
  it("makes layouts at the provider's size, with file-name-safe ids and the placement kept", async () => {
    const { layoutsFromPrintAreas, createPrintFileNaming } = await import("../src/index.js");
    // Printful product 71's print areas, read live on 2026-11-20.
    const layouts = layoutsFromPrintAreas([
      { key: "front", widthInches: 12, heightInches: 16, dpi: 150, technique: "dtg" },
      { key: "sleeve_left", widthInches: 4, heightInches: 3.5, dpi: 150, technique: "dtg" },
      { key: "front", widthInches: 12, heightInches: 16, dpi: 150, technique: "dtfilm" },
      { key: "label_inside", widthInches: 3, heightInches: 1.13, dpi: 300, technique: "dtg" },
      { key: "label_inside", widthInches: 3, heightInches: 3, dpi: 150, technique: "dtg" },
    ]);
    expect(Object.keys(layouts)).toEqual(["front", "sleeve-left", "front-dtfilm", "label-inside", "label-inside-dtg"]);
    expect(layouts.front).toMatchObject({ px: [1800, 2400], placement: "front", technique: "dtg" });
    expect(layouts["sleeve-left"]).toMatchObject({ px: [600, 525], placement: "sleeve_left" });
    expect(layouts["label-inside"]!.px).toEqual([900, 339]);
    expect(Object.keys(layoutsFromPrintAreas([{ key: "front", widthInches: 12, heightInches: 16, dpi: 150, technique: "dtfilm" }, { key: "front", widthInches: 12, heightInches: 16, dpi: 150, technique: "dtg" }], { technique: "dtg" }))).toEqual(["front"]);
    const naming = createPrintFileNaming({ prefix: "print-files", layouts });
    expect(naming.path("logo", 2, "sleeve-left")).toBe("/print-files/logo-v2-sleeve-left.png");
    expect(naming.parse("logo-v2-front-dtfilm.png")).toEqual({ artId: "logo", version: 2, layout: "front-dtfilm" });
  });
});
