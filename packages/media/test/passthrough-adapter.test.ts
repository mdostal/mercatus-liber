import { describe, expect, it } from "vitest";
import { createPassthroughImageAdapter } from "../src/passthrough-adapter.js";

describe("createPassthroughImageAdapter", () => {
  it("returns src completely unchanged when no transform hints are given", () => {
    const adapter = createPassthroughImageAdapter();
    const url = adapter.resolveUrl({ src: "https://example.com/photo.jpg" });
    expect(url).toBe("https://example.com/photo.jpg");
  });

  it("ignores every transform hint -- width/height/fit/quality never change the returned URL", () => {
    const adapter = createPassthroughImageAdapter();
    const url = adapter.resolveUrl({
      src: "https://example.com/photo.jpg",
      width: 640,
      height: 480,
      fit: "cover",
      quality: 80,
    });
    expect(url).toBe("https://example.com/photo.jpg");
  });

  it("passes through any src shape verbatim, including a relative path or a non-URL string, without validating it", () => {
    const adapter = createPassthroughImageAdapter();
    expect(adapter.resolveUrl({ src: "/local/asset.png" })).toBe("/local/asset.png");
    expect(adapter.resolveUrl({ src: "not-a-real-url" })).toBe("not-a-real-url");
  });
});
