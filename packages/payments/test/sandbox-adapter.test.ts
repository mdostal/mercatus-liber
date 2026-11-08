import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createSandboxPaymentAdapter } from "../src/sandbox-adapter.js";

const params = (url: string) => new URL(url, "https://shop.example").searchParams;

describe("sandbox payment adapter", () => {
  it("🔍 includes shipping in the total it shows, and says how much was shipping", async () => {
    const adapter = createSandboxPaymentAdapter({ events: createInMemoryEventBus(), checkoutPagePath: "/checkout/sandbox" });
    const input = { orderRef: "o1", lineItems: [{ name: "Tee", unitAmount: { amount: 2800, currency: "USD" }, quantity: 2 }], successUrl: "https://s", cancelUrl: "https://c" };
    const plain = params((await adapter.createPaymentSession(input)).redirectUrl);
    expect(plain.get("total")).toBe("5600");
    expect(plain.has("shipping")).toBe(false);
    const shipped = params((await adapter.createPaymentSession({ ...input, shipping: { label: "Standard", amount: { amount: 799, currency: "USD" } } })).redirectUrl);
    expect(shipped.get("total")).toBe("6399");
    expect(shipped.get("shipping")).toBe("799");
  });
});
