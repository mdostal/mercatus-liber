import { describe, expect, it } from "vitest";
import { createInMemoryIndex } from "../src/in-memory-index.js";
import type { SearchDocument } from "../src/types.js";

const dragon: SearchDocument = {
  id: "p1",
  title: "Dragon Cable Organizer",
  description: "A dragon-branded cable organizer.",
  facets: { color: "red", materials: ["PLA", "PETG"] },
};
const desk: SearchDocument = {
  id: "p2",
  title: "Dragon Desk Mat",
  description: "A desk mat.",
  facets: { color: "black" },
};

describe("createInMemoryIndex", () => {
  it("index + query by text matches title or description, case-insensitively", async () => {
    const index = createInMemoryIndex();
    await index.index(dragon);
    await index.index(desk);

    const byTitle = await index.query({ text: "DRAGON" });
    expect(byTitle.map((d) => d.id).sort()).toEqual(["p1", "p2"]);

    const byDescription = await index.query({ text: "organizer" });
    expect(byDescription.map((d) => d.id)).toEqual(["p1"]);
  });

  it("query by facet filters to documents whose facet matches, including array-valued facets", async () => {
    const index = createInMemoryIndex();
    await index.index(dragon);
    await index.index(desk);

    expect((await index.query({ facets: { color: "black" } })).map((d) => d.id)).toEqual(["p2"]);
    expect((await index.query({ facets: { materials: "PETG" } })).map((d) => d.id)).toEqual(["p1"]);
    expect(await index.query({ facets: { color: "nonexistent" } })).toEqual([]);
  });

  it("combines text and facet filters (AND semantics)", async () => {
    const index = createInMemoryIndex();
    await index.index(dragon);
    await index.index(desk);
    const result = await index.query({ text: "dragon", facets: { color: "black" } });
    expect(result.map((d) => d.id)).toEqual(["p2"]);
  });

  it("remove takes a document out of the index", async () => {
    const index = createInMemoryIndex();
    await index.index(dragon);
    await index.remove("p1");
    expect(await index.query({})).toEqual([]);
  });

  it("reindexAll replaces the entire index -- no stale entries survive", async () => {
    const index = createInMemoryIndex();
    await index.index(dragon);
    await index.index(desk);
    await index.reindexAll([dragon]);
    expect((await index.query({})).map((d) => d.id)).toEqual(["p1"]);
  });
});
