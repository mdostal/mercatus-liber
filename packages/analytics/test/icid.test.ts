import { describe, expect, it } from "vitest";
import { buildIcid, parseIcid, withIcid } from "../src/index.js";

describe("icid", () => {
  it("builds and reads ids like a retailer's homepage tiles", () => {
    const icid = buildIcid({ placement: "hp", name: "Fleece Fav", date: "2026-11-18T12:00:00Z" });
    expect(icid).toBe("hp-fleece_fav-tileclick-20261118");
    expect(parseIcid(icid)).toEqual({ placement: "hp", name: "fleece_fav", action: "tileclick", date: "2026-11-18" });
    expect(parseIcid("spring sale")).toBeNull();
    expect(() => buildIcid({ placement: "hp", name: "!!", date: "2026-11-18" })).toThrow();
  });

  it("adds the icid to a link, replacing one already there and keeping the rest", () => {
    expect(withIcid("/demo/print-shop/lines/frost", "hp-frost-tileclick-20261130")).toBe("/demo/print-shop/lines/frost?icid=hp-frost-tileclick-20261130");
    expect(withIcid("/search?q=mug&icid=old#top", "new")).toBe("/search?q=mug&icid=new#top");
    expect(withIcid("https://shop.example/men?x=1", "a")).toBe("https://shop.example/men?x=1&icid=a");
  });
});
