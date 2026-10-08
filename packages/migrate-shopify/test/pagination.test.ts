import { describe, expect, it, vi } from "vitest";
import { drainConnection, drainRemainingPages } from "../src/pagination.js";

describe("drainConnection", () => {
  it("follows pageInfo.endCursor across a real two-page response and concatenates nodes in order", async () => {
    const fetchPage = vi.fn(async (cursor: string | null) => {
      if (cursor === null) {
        return { nodes: ["a", "b"], pageInfo: { hasNextPage: true, endCursor: "cursor-b" } };
      }
      if (cursor === "cursor-b") {
        return { nodes: ["c"], pageInfo: { hasNextPage: false, endCursor: null } };
      }
      throw new Error(`unexpected cursor: ${cursor}`);
    });

    const result = await drainConnection(fetchPage);

    expect(result).toEqual(["a", "b", "c"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, null);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-b");
  });

  it("stops after a single page when hasNextPage is false", async () => {
    const fetchPage = vi.fn(async () => ({ nodes: [1, 2, 3], pageInfo: { hasNextPage: false, endCursor: "c3" } }));

    const result = await drainConnection(fetchPage);

    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not infinite-loop if hasNextPage is true but endCursor is missing (defensive against a misbehaving API/fake)", async () => {
    const fetchPage = vi.fn(async () => ({ nodes: [1], pageInfo: { hasNextPage: true, endCursor: null } }));

    const result = await drainConnection(fetchPage);

    expect(result).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe("drainRemainingPages", () => {
  it("fetches no extra pages when the first page already says hasNextPage: false", async () => {
    const fetchPage = vi.fn();
    const result = await drainRemainingPages({ hasNextPage: false, endCursor: null }, fetchPage);
    expect(result).toEqual([]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fetches exactly the remaining pages, starting from the first page's endCursor", async () => {
    const fetchPage = vi.fn(async (cursor: string) => {
      if (cursor === "p1") return { nodes: ["second"], pageInfo: { hasNextPage: true, endCursor: "p2" } };
      if (cursor === "p2") return { nodes: ["third"], pageInfo: { hasNextPage: false, endCursor: null } };
      throw new Error(`unexpected cursor: ${cursor}`);
    });

    const result = await drainRemainingPages({ hasNextPage: true, endCursor: "p1" }, fetchPage);

    expect(result).toEqual(["second", "third"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
