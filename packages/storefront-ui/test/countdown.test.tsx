// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Countdown, formatRemaining, formatWhen, SaleWindow } from "../src/index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPEN = "2026-11-30T18:00:00.000Z";
const CLOSE = "2026-12-07T18:00:00.000Z";

describe("formatting", () => {
  it("shows the two largest units, and the date in the store's time zone", () => {
    expect(formatRemaining(2 * 86400e3 + 4 * 3600e3 + 59e3)).toBe("2d 4h");
    expect(formatRemaining(4 * 3600e3 + 5 * 60e3)).toBe("4h 05m");
    expect(formatRemaining(5 * 60e3 + 9e3)).toBe("5m 09s");
    expect(formatRemaining(9_400)).toBe("9s");
    expect(formatRemaining(-5)).toBe("0s");
    expect(formatWhen(OPEN, { timeZone: "America/Chicago" })).toBe("Mon, Nov 30, 12:00 PM CST");
  });
});

describe("Countdown and SaleWindow", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    container.remove();
    vi.useRealTimers();
  });

  it("renders the same on the server and in the browser, then ticks and fires onReach once at zero", async () => {
    const serverNow = "2026-11-30T17:59:58.000Z";
    vi.setSystemTime(new Date(serverNow));
    const onReach = vi.fn();
    const element = <Countdown to={OPEN} now={serverNow} label="Opens in" doneLabel="Open now" onReach={onReach} />;
    container.innerHTML = renderToString(element);
    expect(container.textContent).toBe("Opens in 2s");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(container, element);
    });
    expect(errors).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toBe("Opens in 1s");
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(container.textContent).toBe("Open now");
    expect(onReach).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("shows coming, ending and ended states", () => {
    const life = (state: "upcoming" | "active" | "ended" | "inactive") => ({ state, startsAt: OPEN, endsAt: CLOSE });
    const html = (state: Parameters<typeof life>[0], now: string) => renderToString(<SaleWindow lifecycle={life(state)} now={now} timeZone="America/Chicago" />);
    expect(html("upcoming", "2026-11-28T18:00:00Z")).toContain("Opens in <time dateTime=\"2026-11-30T18:00:00.000Z\">2d 0h</time>");
    expect(html("upcoming", "2026-11-28T18:00:00Z")).toContain("Mon, Nov 30, 12:00 PM CST");
    expect(html("active", "2026-12-07T13:00:00Z")).toContain("Ends in <time dateTime=\"2026-12-07T18:00:00.000Z\">5h 00m</time>");
    expect(html("ended", "2026-12-08T00:00:00Z")).toContain('data-sale-window="ended"');
    expect(html("inactive", "2026-12-08T00:00:00Z")).toBe("");
    expect(renderToString(<SaleWindow lifecycle={{ state: "active", startsAt: null, endsAt: null }} now={OPEN} />)).toBe("");
  });
});
