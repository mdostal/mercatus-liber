import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateWebhookSecret, signWebhookPayload, verifyWebhookSignature } from "../src/signer.js";

describe("signWebhookPayload / verifyWebhookSignature", () => {
  it("produces the exact sha256={hexdigest} format adapter-printify's verifyPrintifySignature expects, over the raw body", () => {
    const secret = "test-secret";
    const rawBody = JSON.stringify({ hello: "world" });

    const signature = signWebhookPayload(secret, rawBody);
    const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(signature).toBe(`sha256=${expectedHex}`);
  });

  it("verifies a signature it just produced", () => {
    const secret = generateWebhookSecret();
    const rawBody = JSON.stringify({ orderId: "order_123" });

    const signature = signWebhookPayload(secret, rawBody);

    expect(verifyWebhookSignature(secret, rawBody, signature)).toBe(true);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const rawBody = JSON.stringify({ orderId: "order_123" });
    const signature = signWebhookPayload("secret-a", rawBody);

    expect(verifyWebhookSignature("secret-b", rawBody, signature)).toBe(false);
  });

  it("rejects a signature checked against a tampered body", () => {
    const secret = "test-secret";
    const signature = signWebhookPayload(secret, JSON.stringify({ amount: 100 }));

    expect(verifyWebhookSignature(secret, JSON.stringify({ amount: 100_000 }), signature)).toBe(false);
  });

  it("generates a 64-hex-char (32-byte) secret", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });
});
