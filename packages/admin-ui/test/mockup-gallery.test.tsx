// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockupGallery, type MockupPollResult } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MockupGallery", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });
  const button = (prefix: string) => [...container.querySelectorAll("button")].find((b) => b.textContent!.startsWith(prefix))!;

  it("requests mockups, waits for them, and keeps the chosen ones in order", async () => {
    const polls: MockupPollResult[] = [{ status: "pending" }, { status: "completed", images: [{ key: "4025-front", url: "/m/aqua.jpg", label: "Aqua, front" }, { key: "4018-front", url: "/m/black.jpg", label: "Black, front" }] }];
    const onRequest = vi.fn(async () => ({ ok: true as const, taskId: "t1" }));
    const onPoll = vi.fn(async () => polls.shift()!);
    const onSave = vi.fn(async () => ({ ok: true as const, message: "Saved 2 images." }));
    await act(async () => root.render(<MockupGallery variants={[{ id: "4025", label: "Aqua" }, { id: "4018", label: "Black" }]} onRequest={onRequest} onPoll={onPoll} onSave={onSave} pollSeconds={1} />));
    await act(async () => container.querySelector<HTMLInputElement>("[data-variant='4018'] input")!.click());
    await act(async () => button("Make mockups").click());
    expect(onRequest).toHaveBeenCalledWith(["4025", "4018"]);
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("[data-mockup]")).toHaveLength(2);
    await act(async () => container.querySelector<HTMLInputElement>("[data-mockup='4018-front'] input")!.click());
    await act(async () => container.querySelector<HTMLInputElement>("[data-mockup='4025-front'] input")!.click());
    await act(async () => button("Keep 2").click());
    expect(onSave).toHaveBeenCalledWith([expect.objectContaining({ key: "4018-front" }), expect.objectContaining({ key: "4025-front" })]);
    expect(container.querySelector("[role=status]")!.textContent).toBe("Saved 2 images.");
  });

  it("says when to try again after a rate limit", async () => {
    await act(async () => root.render(<MockupGallery variants={[{ id: "1", label: "Aqua" }]} onRequest={async () => ({ ok: false, error: "Printful allows 2 mockup requests a minute.", retryAfterSeconds: 42 })} onPoll={vi.fn()} onSave={vi.fn()} />));
    await act(async () => button("Make mockups").click());
    expect(container.querySelector("[role=alert]")!.textContent).toBe("Printful allows 2 mockup requests a minute. Try again in 42 s.");
  });
});
