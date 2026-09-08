import type { AttributeValue } from "@mercatus-liber/core";

export interface SearchDocument {
  id: string;
  title: string;
  description: string;
  facets: Record<string, AttributeValue | AttributeValue[]>;
}

export interface SearchQueryParams {
  text?: string;
  /** Every specified facet key must match (array-valued facets match if the array includes the queried value). */
  facets?: Record<string, AttributeValue>;
}

/**
 * The pluggable search backend contract (subsystem 03). A default in-memory
 * implementation ships in this package (in-memory-index.ts); Solr/
 * Elasticsearch/Algolia/Meilisearch are later, optional adapter swaps -- same
 * "zero infra out of the box, adapters over hard dependencies" pattern as
 * persistence and payments.
 */
export interface SearchIndexAdapter {
  index(doc: SearchDocument): Promise<void>;
  remove(id: string): Promise<void>;
  query(params: SearchQueryParams): Promise<SearchDocument[]>;
  /** Replaces the entire index contents -- no stale entries survive from before. */
  reindexAll(docs: SearchDocument[]): Promise<void>;
}

/**
 * The narrowest read dependency this package has on catalog data -- a
 * structural interface, not an import of @mercatus-liber/catalog.
 * @mercatus-liber/catalog's CatalogService satisfies this shape already.
 */
export interface ProductDataLookup {
  getProduct(id: string): Promise<{ id: string; title: string; description: string; status: string } | null>;
  listAttributes(id: string): Promise<{ key: string; value: AttributeValue | AttributeValue[]; facetable: boolean }[]>;
}
