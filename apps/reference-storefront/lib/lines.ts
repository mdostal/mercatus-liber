/**
 * Lines (sales catalogs) in the demo: named, scheduled sets of products with
 * their own landing page, like HCL Commerce's sales catalogs. Each belongs to
 * one demo through masterCatalogId (the demo's own catalog), so demos sharing
 * a database see only their own.
 */
import type { Catalog, CatalogService } from "@mercatus-liber/catalog";
import { lifecycle, type Lifecycle } from "@mercatus-liber/core";
import { DEMO_CATALOG_SLUG, type DemoSlug } from "./demos";

export interface LineSummary {
  line: Catalog;
  lifecycle: Lifecycle;
}

/** This demo's lines that aren't drafts, soonest first (lines with no start first). */
export async function listLinesForDemo(catalog: CatalogService, demoSlug: DemoSlug, now: Date = new Date()): Promise<LineSummary[]> {
  const master = await catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
  if (!master) return [];
  const lines = await catalog.listCatalogs({ kind: "sales", masterCatalogId: master.id });
  return lines
    .map((line) => ({ line, lifecycle: lifecycle({ status: line.status ?? "active", activeFrom: line.activeFrom ?? null, activeTo: line.activeTo ?? null }, now) }))
    .filter((l) => l.lifecycle.state !== "inactive")
    .sort((a, b) => (a.line.activeFrom ? Date.parse(a.line.activeFrom) : 0) - (b.line.activeFrom ? Date.parse(b.line.activeFrom) : 0));
}

/** A line's landing data, only when it belongs to this demo and isn't a draft. */
export async function getLineForDemo(catalog: CatalogService, demoSlug: DemoSlug, lineSlug: string, now: Date = new Date()) {
  const master = await catalog.getCatalogBySlug(DEMO_CATALOG_SLUG[demoSlug]);
  const landing = await catalog.getCatalogLanding(lineSlug, now);
  if (!master || !landing || landing.catalog.kind !== "sales" || landing.catalog.masterCatalogId !== master.id || landing.lifecycle.state === "inactive") return null;
  return landing;
}
