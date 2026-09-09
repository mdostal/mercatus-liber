import { describe, expect, it } from "vitest";
import { createCloudinaryFetchAdapter } from "../src/index.js";

describe("createCloudinaryFetchAdapter", () => {
  it("builds a real fetch-mode URL with width/height/cover/quality transforms, source URL appended raw (not percent-encoded)", () => {
    const adapter = createCloudinaryFetchAdapter({ cloudName: "demo" });
    const url = adapter.resolveUrl({
      src: "https://example.com/photo.jpg",
      width: 640,
      height: 480,
      fit: "cover",
      quality: 80,
    });
    expect(url).toBe("https://res.cloudinary.com/demo/image/fetch/w_640,h_480,c_fill,q_80,f_auto/https://example.com/photo.jpg");
  });

  it("maps fit:\"contain\" to Cloudinary's c_fit crop mode, not c_fill", () => {
    const adapter = createCloudinaryFetchAdapter({ cloudName: "demo" });
    const url = adapter.resolveUrl({ src: "https://example.com/photo.jpg", width: 300, fit: "contain" });
    expect(url).toContain("c_fit");
    expect(url).not.toContain("c_fill");
  });

  it("defaults to q_auto when no quality is given, and always appends f_auto", () => {
    const adapter = createCloudinaryFetchAdapter({ cloudName: "demo" });
    const url = adapter.resolveUrl({ src: "https://example.com/photo.jpg" });
    expect(url).toBe("https://res.cloudinary.com/demo/image/fetch/q_auto,f_auto/https://example.com/photo.jpg");
  });

  it("omits width/height/fit segments entirely when not provided, rather than emitting an empty/undefined transform", () => {
    const adapter = createCloudinaryFetchAdapter({ cloudName: "demo" });
    const url = adapter.resolveUrl({ src: "https://example.com/photo.jpg" });
    expect(url).not.toMatch(/w_undefined|h_undefined|c_undefined/);
  });

  it("uses the configured cloud name in every URL it builds", () => {
    const adapter = createCloudinaryFetchAdapter({ cloudName: "my-real-shop" });
    const url = adapter.resolveUrl({ src: "https://example.com/photo.jpg" });
    expect(url.startsWith("https://res.cloudinary.com/my-real-shop/image/fetch/")).toBe(true);
  });
});
