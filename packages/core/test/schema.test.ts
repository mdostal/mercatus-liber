import { describe, expect, it } from "vitest";
import {
  createInMemoryEventBus,
  type CategoryRef,
  type EventBus,
  type Money,
  type Product,
  type ProductAttribute,
  type Sku,
} from "../src/index.js";

describe("core schema shapes", () => {
  it("Product has the documented shape", () => {
    const product: Product = {
      id: "p1",
      slug: "dragon-cable-organizer",
      title: "Dragon Cable Organizer",
      description: "A cable organizer.",
      identifyingAttributeKeys: ["color", "size"],
      status: "active",
    };
    expect(product.identifyingAttributeKeys).toEqual(["color", "size"]);
  });

  it("Sku identifying attributes match the documented shape", () => {
    const sku: Sku = {
      id: "s1",
      productId: "p1",
      identifyingAttributes: [
        { key: "color", value: "red" },
        { key: "size", value: "large" },
      ],
      price: { amount: 1999, currency: "USD" } satisfies Money,
      status: "active",
    };
    expect(sku.price.amount).toBe(1999);
  });

  it("ProductAttribute supports scalar and array values with a facetable flag", () => {
    const attr: ProductAttribute = {
      productId: "p1",
      key: "printer_compatible",
      value: true,
      facetable: true,
    };
    const multiValueAttr: ProductAttribute = {
      productId: "p1",
      key: "materials",
      value: ["PLA", "PETG"],
      facetable: true,
    };
    expect(attr.facetable).toBe(true);
    expect(multiValueAttr.value).toEqual(["PLA", "PETG"]);
  });

  it("CategoryRef is the minimal id/slug shape", () => {
    const ref: CategoryRef = { id: "c1", slug: "toys" };
    expect(ref).toEqual({ id: "c1", slug: "toys" });
  });
});

describe("createInMemoryEventBus", () => {
  it("delivers a published event to a subscribed handler", async () => {
    const bus: EventBus = createInMemoryEventBus();
    let received: unknown = null;
    bus.subscribe<{ id: string }>("catalog.product.created", async (payload) => {
      received = payload;
    });
    await bus.publish("catalog.product.created", { id: "p1" });
    expect(received).toEqual({ id: "p1" });
  });

  it("runs multiple handlers for the same event and still resolves publish()", async () => {
    const bus = createInMemoryEventBus();
    const calls: string[] = [];
    bus.subscribe("catalog.product.updated", async () => {
      calls.push("first");
    });
    bus.subscribe("catalog.product.updated", async () => {
      calls.push("second");
    });
    await bus.publish("catalog.product.updated", {});
    expect(calls).toEqual(["first", "second"]);
  });

  it("does not deliver events to handlers subscribed to a different event name", async () => {
    const bus = createInMemoryEventBus();
    let called = false;
    bus.subscribe("catalog.product.archived", async () => {
      called = true;
    });
    await bus.publish("catalog.product.created", {});
    expect(called).toBe(false);
  });

  it("rethrows an AggregateError when a handler throws, after attempting all handlers", async () => {
    const bus = createInMemoryEventBus();
    const calls: string[] = [];
    bus.subscribe("checkout.order.placed", async () => {
      calls.push("first");
      throw new Error("boom");
    });
    bus.subscribe("checkout.order.placed", async () => {
      calls.push("second");
    });
    await expect(bus.publish("checkout.order.placed", {})).rejects.toThrow(AggregateError);
    expect(calls).toEqual(["first", "second"]);
  });
});
