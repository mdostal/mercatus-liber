/**
 * scc-07: tests app/api/demo/[demoSlug]/copilot/route.ts's HTTP-level
 * contract (status codes, JSON error shapes) by mocking lib/copilot-runtime.js
 * wholesale -- the actual copilot business logic (permission gating,
 * CmsService/ThemingService writes, the tool-calling loop) is covered by
 * test/copilot-runtime.test.ts and scc-06's own test/copilot-loop.test.ts /
 * test/copilot-handlers.test.ts; this file only proves the route wires
 * request parsing and response shaping correctly, using plain Web
 * Request/Response objects (no live Next.js server needed, same posture as
 * every other test in this suite -- see test/admin-mutation-guard.test.ts's
 * own header comment on "no real Next.js request machinery in a vitest
 * run").
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const isCopilotConfigured = vi.fn<() => boolean>();
const runDemoCopilotTurn = vi.fn();

vi.mock("../lib/copilot-runtime.js", () => ({
  isCopilotConfigured: (...args: unknown[]) => isCopilotConfigured(...(args as [])),
  runDemoCopilotTurn: (...args: unknown[]) => runDemoCopilotTurn(...args),
}));

const { POST } = await import("../app/api/demo/[demoSlug]/copilot/route.js");

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/demo/print-shop/copilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(demoSlug: string) {
  return { params: Promise.resolve({ demoSlug }) };
}

describe("POST /api/demo/[demoSlug]/copilot (scc-07)", () => {
  beforeEach(() => {
    isCopilotConfigured.mockReset();
    runDemoCopilotTurn.mockReset();
  });

  it("404s for an unknown demo slug", async () => {
    const res = await POST(jsonRequest({ requestText: "hi" }) as never, params("not-a-real-demo"));
    expect(res.status).toBe(404);
  });

  it("503s with the honest not-configured message when ANTHROPIC_API_KEY isn't set", async () => {
    isCopilotConfigured.mockReturnValue(false);

    const res = await POST(jsonRequest({ requestText: "hi" }) as never, params("print-shop"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(runDemoCopilotTurn).not.toHaveBeenCalled();
  });

  it("400s when requestText is missing or blank", async () => {
    isCopilotConfigured.mockReturnValue(true);

    const res = await POST(jsonRequest({ requestText: "   " }) as never, params("print-shop"));
    expect(res.status).toBe(400);
    expect(runDemoCopilotTurn).not.toHaveBeenCalled();
  });

  it("401s when runDemoCopilotTurn throws (no admin session)", async () => {
    isCopilotConfigured.mockReturnValue(true);
    runDemoCopilotTurn.mockRejectedValue(new Error("Not authorized: an authenticated admin session is required."));

    const res = await POST(jsonRequest({ requestText: "hello" }) as never, params("print-shop"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/not authorized/i);
  });

  it("200s with the turn result JSON when everything succeeds, forwarding demoSlug/requestText through", async () => {
    isCopilotConfigured.mockReturnValue(true);
    runDemoCopilotTurn.mockResolvedValue({ finalText: "Here are your options.", toolCalls: [], stopReason: "end_turn" });

    const res = await POST(jsonRequest({ requestText: "make the hero seasonal" }) as never, params("print-shop"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ finalText: "Here are your options.", toolCalls: [], stopReason: "end_turn" });
    expect(runDemoCopilotTurn).toHaveBeenCalledWith({ demoSlug: "print-shop", requestText: "make the hero seasonal", maxIterations: undefined });
  });
});
