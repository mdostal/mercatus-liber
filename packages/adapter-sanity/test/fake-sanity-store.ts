import type { SanityMarketingMetaDoc, SanityPageDoc } from "../src/mapping.js";
import { MARKETING_META_DOC_TYPE, PAGE_DOC_TYPE } from "../src/mapping.js";

/**
 * A stateful fake Sanity Content API double -- NOT a live Sanity project.
 * No live project/token exists in this environment (same disclosed gap as
 * adapter-shopify's fake store and adapter-postgres's fake pool).
 * Recognizes exactly the fixed, known set of GROQ queries and mutations
 * @mercatus-liber/adapter-sanity issues and serves them from in-memory
 * Maps, so the adapter's own query-construction logic is genuinely
 * exercised -- it does NOT validate against Sanity's real GROQ parser or
 * wire behavior. Real integration verification against a live Sanity
 * project is a documented follow-up, not fabricated here.
 */
export function createFakeSanityFetch(): typeof fetch {
  const pages = new Map<string, SanityPageDoc>();
  const metas = new Map<string, SanityMarketingMetaDoc>();

  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const respond = (body: unknown) => ({ json: async () => body }) as unknown as Response;
    const method = init?.method ?? "GET";

    if (method === "GET") {
      const groq = url.searchParams.get("query") ?? "";
      const params: Record<string, unknown> = {};
      for (const [key, value] of url.searchParams.entries()) {
        if (key.startsWith("$")) params[key.slice(1)] = JSON.parse(value);
      }
      const isSingle = groq.trim().endsWith("[0]");

      let result: unknown;
      if (groq.includes(`_type == "${PAGE_DOC_TYPE}"`)) {
        let matches = [...pages.values()];
        if (groq.includes("_id == $id")) matches = matches.filter((p) => p._id === params.id);
        if (groq.includes("slug == $slug")) matches = matches.filter((p) => p.slug === params.slug);
        if (groq.includes("pageType == $pageType")) matches = matches.filter((p) => p.pageType === params.pageType);
        if (groq.includes("status == $status")) matches = matches.filter((p) => p.status === params.status);
        result = isSingle ? (matches[0] ?? null) : matches;
      } else if (groq.includes(`_type == "${MARKETING_META_DOC_TYPE}"`)) {
        let matches = [...metas.values()];
        if (groq.includes("_id == $id")) matches = matches.filter((m) => m._id === params.id);
        result = isSingle ? (matches[0] ?? null) : matches;
      } else {
        throw new Error(`FakeSanityFetch: unrecognized GROQ query -- ${groq}`);
      }

      return respond({ query: groq, result });
    }

    // Mutations API
    const body = JSON.parse(String(init?.body)) as { mutations: { createOrReplace?: SanityPageDoc | SanityMarketingMetaDoc }[] };
    for (const mutation of body.mutations) {
      const doc = mutation.createOrReplace;
      if (!doc) continue;
      if (doc._type === PAGE_DOC_TYPE) pages.set(doc._id, doc);
      else if (doc._type === MARKETING_META_DOC_TYPE) metas.set(doc._id, doc);
    }
    return respond({ results: [] });
  };

  return fakeFetch as unknown as typeof fetch;
}
