/**
 * commerce-gap-audit-3, finding #8: the brand-system landing page
 * (app/(landing)/**, epic 55/bs-02-landing-page-brand/landing-visual-glow-up)
 * had zero test coverage of any kind -- no file in this suite's `test/`
 * matched "landing" or "brand". This is a mostly-static marketing surface,
 * so the meaningful things to prove aren't pixel-perfect styling but: (1)
 * the page renders its real, sourced-from-README/VISION content (hero
 * tagline, the "why it exists" pitch, the FAQ) rather than placeholder copy,
 * (2) the live-demo cards are genuinely data-driven off lib/demos.ts's
 * DEMO_REGISTRY (not a hardcoded, driftable list -- this page's own doc
 * comment says so; this test proves it against the real registry), and (3)
 * the shared layout actually carries the real brand-system tokens
 * (.pHive/brand/brand-system.yaml's Ledger Indigo/Garnet/Carbon Ink/Paper
 * Neutral colors, Public Sans/JetBrains Mono type system) rather than the
 * bespoke navy/purple palette bs-02-landing-page-brand's own doc comment
 * says it replaced.
 *
 * `LandingPage`/`LandingRootLayout` are both plain, synchronous, pure-render
 * function components (no hooks, no data fetching), same shape as
 * RecommendationShelf -- callable directly and walked without a DOM
 * renderer, same "collectHrefs" base pattern as
 * recommendation-shelf.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { DEMO_REGISTRY, DEMO_SLUGS } from "../lib/demos.js";
import { JsonLd } from "../lib/json-ld.js";
import LandingPage from "../app/(landing)/page.js";
import LandingRootLayout from "../app/(landing)/layout.js";

type Element = { type: unknown; props: Record<string, unknown> };
function isElement(node: unknown): node is Element {
  return node !== null && typeof node === "object" && "type" in (node as object) && "props" in (node as object);
}

function flattenText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isElement(node)) return flattenText(node.props.children as ReactNode);
  return "";
}

function collectHrefs(node: ReactNode, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectHrefs(child, acc);
    return acc;
  }
  if (!isElement(node)) return acc;
  if (node.type === "a" && typeof node.props.href === "string") acc.push(node.props.href);
  collectHrefs(node.props.children as ReactNode, acc);
  return acc;
}

/** Every real JSON-LD `data` payload the page actually passes to `<JsonLd>`, in document order -- proves the page's real structured-data content (not just its visible copy) is real, sourced content, by comparing element identity against the real, imported `JsonLd` component rather than re-deriving its shape. */
function collectJsonLdData(node: ReactNode, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const child of node) collectJsonLdData(child, acc);
    return acc;
  }
  if (!isElement(node)) return acc;
  if (node.type === JsonLd) acc.push(node.props.data as Record<string, unknown>);
  collectJsonLdData(node.props.children as ReactNode, acc);
  return acc;
}

describe("LandingPage (epic 55 brand-system landing page): real content, real demo data", () => {
  const element = LandingPage();
  const text = flattenText(element);

  it("renders the real hero name/tagline, sourced from README.md, not placeholder copy", () => {
    expect(text).toContain("Mercatus Liber");
    expect(text).toMatch(/headless/i);
    expect(text).toContain("Shopify");
    expect(text).toContain("Medusa");
    expect(text).toContain("Saleor");
  });

  it("renders the real 'why it exists' pitch: no free/OSS platform separates the marketing catalog from the sales catalog", () => {
    expect(text).toMatch(/marketing catalog/i);
    expect(text).toMatch(/sales catalog/i);
    expect(text).toContain("Medusa");
    expect(text).toContain("Saleor");
    expect(text).toContain("Vendure");
  });

  it("renders one real, data-driven demo card per DEMO_REGISTRY entry -- never a hardcoded/stale list", () => {
    expect(DEMO_SLUGS.length).toBeGreaterThan(0);
    for (const slug of DEMO_SLUGS) {
      const demo = DEMO_REGISTRY[slug];
      expect(text).toContain(demo.displayName);
      expect(text).toContain(demo.description);
    }

    const hrefs = collectHrefs(element);
    for (const slug of DEMO_SLUGS) {
      expect(hrefs).toContain(`/demo/${slug}`);
    }
    // Exactly one demo-card link per real registry slug -- not fewer (a
    // silently dropped demo) and not more (a stale/duplicated card).
    const demoHrefs = hrefs.filter((href) => href.startsWith("/demo/"));
    expect(demoHrefs).toHaveLength(DEMO_SLUGS.length);
  });

  it("links to the theme gallery, matching the real /themes route", () => {
    const hrefs = collectHrefs(element);
    expect(hrefs).toContain("/themes");
  });

  it("renders the real FAQ content, matching the FAQPage JSON-LD it also emits (Google's structured-data guidance: visible content must match the JSON-LD, never hidden-only)", () => {
    expect(text).toContain("What is Mercatus Liber?");
    expect(text).toContain("Is Mercatus Liber free?");
    expect(text).toContain("Can I self-host it?");
    expect(text).toMatch(/MIT-licensed/);

    const jsonLdPayloads = collectJsonLdData(element);
    // organizationJsonLd (an @graph of Organization + WebSite) and faqJsonLd
    // (FAQPage) -- both real, both emitted.
    expect(jsonLdPayloads).toHaveLength(2);
    const faqPayload = jsonLdPayloads.find((payload) => payload["@type"] === "FAQPage");
    expect(faqPayload).toBeDefined();
    const questions = (faqPayload!.mainEntity as { name: string }[]).map((q) => q.name);
    expect(questions).toContain("What is Mercatus Liber?");
    expect(questions).toContain("Is Mercatus Liber free?");
    expect(questions).toContain("Can I self-host it?");

    const orgPayload = jsonLdPayloads.find((payload) => Array.isArray(payload["@graph"]));
    expect(orgPayload).toBeDefined();
    const graphTypes = (orgPayload!["@graph"] as { "@type": string }[]).map((entry) => entry["@type"]);
    expect(graphTypes).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
  });
});

describe("LandingRootLayout (bs-02-landing-page-brand): the real brand-system tokens, not the pre-rebrand palette", () => {
  const element = LandingRootLayout({ children: "test-child-marker" });
  const text = flattenText(element);

  it("carries the real brand-system color tokens (.pHive/brand/brand-system.yaml) in its shared CSS", () => {
    // Ledger Indigo (primary), Garnet (secondary), Carbon Ink (neutral), Paper
    // Neutral (surface) -- the exact real hex values this page's own doc
    // comment cites, not a placeholder/previous bespoke navy-purple palette.
    expect(text).toContain("#4338a0");
    expect(text).toContain("#a13a3a");
    expect(text).toContain("#1a1a1d");
    expect(text).toContain("#f3f3f1");
  });

  it("carries the real brand typography tokens: Public Sans (heading/body) + JetBrains Mono (accent)", () => {
    expect(text).toContain("Public Sans");
    expect(text).toContain("JetBrains Mono");
  });

  it("renders the real wordmark and primary nav, and the footer's live-demo links stay in sync with DEMO_REGISTRY", () => {
    expect(text).toContain("mercatus liber");
    expect(text).toMatch(/free.*mit-licensed.*headless commerce/i);

    const hrefs = collectHrefs(element);
    expect(hrefs).toContain("/themes");
    expect(hrefs).toContain("/architecture");
    for (const slug of DEMO_SLUGS) {
      expect(hrefs).toContain(`/demo/${slug}`);
      expect(text).toContain(DEMO_REGISTRY[slug].displayName);
    }
  });

  it("renders the given children in the real <main> slot", () => {
    expect(text).toContain("test-child-marker");
  });
});
