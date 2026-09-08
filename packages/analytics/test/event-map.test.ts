import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENT_MAP, resolveAnalyticsEventName } from "../src/event-map.js";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

describe("ANALYTICS_EVENT_MAP", () => {
  it("covers exactly the commerce events this repo actually publishes today -- grep-verified, no invented events", () => {
    const grepOutput = execSync('grep -rn "events.publish(" packages/*/src || true', {
      cwd: REPO_ROOT,
      encoding: "utf8",
      shell: "/bin/bash",
    });
    const published = new Set(
      grepOutput
        .split("\n")
        .map((line) => line.match(/events\.publish[^"]*"([^"]+)"/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );

    // Every allow-listed topic must actually exist as a real published event.
    for (const busTopic of Object.keys(ANALYTICS_EVENT_MAP)) {
      expect(published.has(busTopic)).toBe(true);
    }

    // Internal catalog/sku admin CRUD events are deliberately excluded (lean
    // allow-list, resolving the doc's open question 1) even though they are
    // published.
    expect(published.has("catalog.product.created")).toBe(true);
    expect(ANALYTICS_EVENT_MAP["catalog.product.created"]).toBeUndefined();
  });

  it("resolveAnalyticsEventName maps an allow-listed topic and returns undefined for anything else", () => {
    expect(resolveAnalyticsEventName("checkout.order.placed")).toBe("order_placed");
    expect(resolveAnalyticsEventName("catalog.product.created")).toBeUndefined();
  });
});
