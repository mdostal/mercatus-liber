import { describe, expect, it } from "vitest";
import { copyImageToMediaStore, createInMemoryMediaStore, serveMediaFile } from "../src/index.js";

describe("media store", () => {
  it("copies an https image and serves it", async () => {
    const store = createInMemoryMediaStore({ baseUrl: "/media" });
    const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch;
    const { id, url } = await copyImageToMediaStore(store, "https://printful-upload.s3-accelerate.amazonaws.com/tmp/x/tee.jpg", "tee.jpg", fetchImpl);
    expect(url).toBe(`/media/${id}`);
    const response = await serveMediaFile(store, id);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("refuses non-https URLs, non-images, failed downloads and unknown ids", async () => {
    const store = createInMemoryMediaStore({ baseUrl: "/media" });
    const html = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const missing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(copyImageToMediaStore(store, "http://x.example/a.png", "a", html)).rejects.toThrow(/Only https/);
    await expect(copyImageToMediaStore(store, "https://x.example/a.png", "a", html)).rejects.toThrow(/not a PNG/);
    await expect(copyImageToMediaStore(store, "https://x.example/a.png", "a", missing)).rejects.toThrow(/HTTP 404/);
    expect((await serveMediaFile(store, "../etc/passwd")).status).toBe(404);
  });
});
