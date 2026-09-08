import type { AttributeValue, EventBus } from "@mercatus-liber/core";
import type { ProductDataLookup, SearchIndexAdapter } from "./types.js";

/**
 * Wires the search index to stay in sync with catalog purely by reacting to
 * event-bus notifications -- never a direct query at request time. On a
 * catalog.product.created/updated event, re-fetches current data via the
 * injected ProductDataLookup and reindexes; on archived, removes the document.
 * See this story's design_decision_note for why this is still "event-only"
 * despite the lookup call (it's event-triggered, not request-time).
 */
export function registerCatalogSearchSync(deps: {
  events: EventBus;
  index: SearchIndexAdapter;
  products: ProductDataLookup;
}): void {
  const { events, index, products } = deps;

  async function syncProduct(id: string): Promise<void> {
    const product = await products.getProduct(id);
    if (!product || product.status !== "active") {
      await index.remove(id);
      return;
    }
    const attributes = await products.listAttributes(id);
    const facets: Record<string, AttributeValue | AttributeValue[]> = {};
    for (const attr of attributes) {
      if (attr.facetable) facets[attr.key] = attr.value;
    }
    await index.index({ id: product.id, title: product.title, description: product.description, facets });
  }

  events.subscribe<{ id: string }>("catalog.product.created", async ({ id }) => syncProduct(id));
  events.subscribe<{ id: string }>("catalog.product.updated", async ({ id }) => syncProduct(id));
  events.subscribe<{ id: string }>("catalog.product.archived", async ({ id }) => {
    await index.remove(id);
  });
  // Facet data lives in the full attribute map, changed independently of the
  // product record itself -- re-sync on either event so facets stay current.
  events.subscribe<{ productId: string }>("catalog.attribute.updated", async ({ productId }) => syncProduct(productId));
  events.subscribe<{ productId: string }>("catalog.attribute.removed", async ({ productId }) => syncProduct(productId));
}
