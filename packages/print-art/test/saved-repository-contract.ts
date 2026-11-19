import { describe, expect, it } from "vitest";
import { ArtVersionTakenError, type SavedArtVersionRepository } from "../src/index.js";

type Copy = { headline: string };

/** What every SavedArtVersionRepository must do. Run it against each storage backend. */
export function describeSavedArtVersionRepositoryContract(
  name: string,
  setup: () => Promise<{ open: () => SavedArtVersionRepository<Copy> }>,
  options: { timeout?: number } = {},
): void {
  describe(`${name} SavedArtVersionRepository`, () => {
    it("keeps each art's versions apart, oldest first, and survives reopening", async () => {
      const { open } = await setup();
      const repo = open();
      await repo.insert("card", { version: 3, copy: { headline: "three" }, note: "n3" });
      await repo.insert("card", { version: 2, copy: { headline: "two" }, note: "n2" });
      await repo.insert("kid", { version: 2, copy: { headline: "kid" }, note: "" });
      const again = open();
      expect(await again.list("card")).toEqual([
        { version: 2, copy: { headline: "two" }, note: "n2" },
        { version: 3, copy: { headline: "three" }, note: "n3" },
      ]);
      expect(await again.list("kid")).toEqual([{ version: 2, copy: { headline: "kid" }, note: "" }]);
      expect(await again.list("none")).toEqual([]);
    }, options.timeout);

    it("refuses a version number that is taken with ArtVersionTakenError, keeping the first", async () => {
      const { open } = await setup();
      const repo = open();
      await repo.insert("card", { version: 2, copy: { headline: "first" }, note: "" });
      await expect(repo.insert("card", { version: 2, copy: { headline: "second" }, note: "" })).rejects.toMatchObject({ name: ArtVersionTakenError.name });
      expect((await repo.list("card")).map((v) => v.copy.headline)).toEqual(["first"]);
    }, options.timeout);
  });
}
