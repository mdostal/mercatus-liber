import type { AttributeValue } from "@mercatus-liber/core";
import type { SearchDocument, SearchIndexAdapter, SearchQueryParams } from "./types.js";

function facetMatches(docValue: AttributeValue | AttributeValue[] | undefined, queryValue: AttributeValue): boolean {
  if (docValue === undefined) return false;
  if (Array.isArray(docValue)) return docValue.includes(queryValue);
  return docValue === queryValue;
}

/** Default in-process search index -- no external service required. See docs/subsystems/03-search.md open question 1 for the honest low-SKU-catalog scaling ceiling this is meant for. */
export function createInMemoryIndex(): SearchIndexAdapter {
  const documents = new Map<string, SearchDocument>();

  return {
    async index(doc) {
      documents.set(doc.id, structuredClone(doc));
    },
    async remove(id) {
      documents.delete(id);
    },
    async query(params: SearchQueryParams) {
      const text = params.text?.toLowerCase().trim();
      const facetEntries = Object.entries(params.facets ?? {});

      return [...documents.values()].filter((doc) => {
        if (text) {
          const haystack = `${doc.title} ${doc.description}`.toLowerCase();
          if (!haystack.includes(text)) return false;
        }
        for (const [key, value] of facetEntries) {
          if (!facetMatches(doc.facets[key], value)) return false;
        }
        return true;
      });
    },
    async reindexAll(docs) {
      documents.clear();
      for (const doc of docs) {
        documents.set(doc.id, structuredClone(doc));
      }
    },
  };
}
