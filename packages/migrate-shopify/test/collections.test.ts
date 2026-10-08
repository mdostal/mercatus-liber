import { describe, expect, it } from "vitest";
import { readAllCollections } from "../src/collections.js";
import { createFakeGraphQLClient, type FakeCollection } from "./fake-graphql-client.js";

describe("readAllCollections -- field mapping", () => {
  it("maps title, handle, and both description fields", async () => {
    const collection: FakeCollection = {
      id: "gid://shopify/Collection/1",
      handle: "embroidery",
      title: "Embroidery",
      description: "Custom embroidered goods.",
      descriptionHtml: "<p>Custom embroidered goods.</p>",
      productHandles: ["embroidered-performance-polo"],
    };

    const [imported] = await readAllCollections(createFakeGraphQLClient({ products: [], collections: [collection] }));

    expect(imported).toEqual({
      shopifyCollectionId: "gid://shopify/Collection/1",
      title: "Embroidery",
      handle: "embroidery",
      description: "Custom embroidered goods.",
      descriptionHtml: "<p>Custom embroidered goods.</p>",
      productHandles: ["embroidered-performance-polo"],
    });
  });
});

describe("readAllCollections -- real cursor pagination", () => {
  function collection(id: string, handle: string): FakeCollection {
    return { id: `gid://shopify/Collection/${id}`, handle, title: handle, description: "", descriptionHtml: "", productHandles: [] };
  }

  it("follows a real two-page collections response end to end", async () => {
    const client = createFakeGraphQLClient({
      products: [],
      collections: [collection("1", "a"), collection("2", "b"), collection("3", "c")],
    });

    const imported = await readAllCollections(client, { collectionsPageSize: 2 });

    expect(imported.map((c) => c.handle)).toEqual(["a", "b", "c"]);
  });

  it("paginates a single collection's member-products connection across two pages without dropping any handle", async () => {
    const productHandles = ["p1", "p2", "p3", "p4", "p5"];
    const client = createFakeGraphQLClient({
      products: [],
      collections: [{ ...collection("1", "big-collection"), productHandles }],
    });

    const [imported] = await readAllCollections(client, { collectionProductsPageSize: 2 });

    expect(imported?.productHandles).toEqual(productHandles);
  });
});
