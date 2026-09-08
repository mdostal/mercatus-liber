import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCapture = vi.fn();
const mockIdentify = vi.fn();

vi.mock("posthog-node", () => ({
  PostHog: vi.fn().mockImplementation(function MockPostHog(this: unknown) {
    Object.assign(this as object, { capture: mockCapture, identify: mockIdentify });
  }),
}));

const { createPostHogAdapter } = await import("../src/posthog-adapter.js");

describe("createPostHogAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("track() calls the underlying client's capture with the mapped event name and properties, anonymous by default", async () => {
    const adapter = createPostHogAdapter({ apiKey: "phc_test_fake" });
    await adapter.track("order_placed", { orderId: "order-1" });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "order_placed",
      properties: { orderId: "order-1" },
    });
  });

  it("track() uses the context userId as distinctId when a logged-in customer is known", async () => {
    const adapter = createPostHogAdapter({ apiKey: "phc_test_fake" });
    await adapter.track("order_placed", { orderId: "order-2" }, { userId: "cust-1" });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "cust-1",
      event: "order_placed",
      properties: { orderId: "order-2" },
    });
  });

  it("identify() calls the underlying client's identify with distinctId + traits", async () => {
    const adapter = createPostHogAdapter({ apiKey: "phc_test_fake" });
    await adapter.identify("cust-1", { email: "a@example.com" });

    expect(mockIdentify).toHaveBeenCalledWith({ distinctId: "cust-1", properties: { email: "a@example.com" } });
  });

  it("page() calls capture with a $pageview event carrying the page name", async () => {
    const adapter = createPostHogAdapter({ apiKey: "phc_test_fake" });
    await adapter.page("home", { referrer: "google" });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "anonymous",
      event: "$pageview",
      properties: { referrer: "google", page: "home" },
    });
  });
});
