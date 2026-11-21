/**
 * Internal campaign ids ("icid"), the parameter retailers put on links from
 * their own pages (homepage tiles, banners) to see which spot sent a shopper,
 * e.g. `?icid=hp-fleece_fav-tileclick-20261118`: where the spot is, what it
 * promotes, the action, and when it went up.
 */

/** Analytics event names for marketing spots and catalog landings. */
export const MARKETING_EVENTS = {
  /** A spot was shown (properties: icid, placement, target). */
  spotViewed: "spot_viewed",
  /** A spot was clicked (properties: icid, placement, target). */
  spotClicked: "spot_clicked",
  /** A line, catalog or category landing page was viewed (properties: catalogId or categoryId, slug, kind, icid when arriving from a spot). */
  catalogViewed: "catalog_viewed",
} as const;

const part = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** `${placement}-${name}-${action}-${yyyymmdd}`, each part lowercased with anything but letters and digits turned into "_". */
export function buildIcid(input: { placement: string; name: string; action?: string; date: Date | string }): string {
  const date = typeof input.date === "string" ? new Date(input.date) : input.date;
  if (Number.isNaN(date.getTime())) throw new Error(`Not a date: ${String(input.date)}`);
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const parts = [part(input.placement), part(input.name), part(input.action ?? "tileclick")];
  if (parts.some((p) => !p)) throw new Error("An icid needs a placement, a name and an action.");
  return [...parts, ymd].join("-");
}

/** The parts of an icid made by buildIcid, or null for anything else. */
export function parseIcid(icid: string): { placement: string; name: string; action: string; date: string } | null {
  const m = /^([a-z0-9_]+)-([a-z0-9_]+)-([a-z0-9_]+)-(\d{8})$/.exec(icid);
  return m ? { placement: m[1]!, name: m[2]!, action: m[3]!, date: `${m[4]!.slice(0, 4)}-${m[4]!.slice(4, 6)}-${m[4]!.slice(6)}` } : null;
}

/** `href` with `icid` set (replacing any already there), keeping the path, other parameters and hash. Works for relative links. */
export function withIcid(href: string, icid: string): string {
  const url = new URL(href, "http://relative.invalid");
  url.searchParams.set("icid", icid);
  return href.startsWith("http://") || href.startsWith("https://") ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
