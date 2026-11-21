"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

/** One item a provider can make, as the grid shows it. */
export interface CatalogGridItem {
  id: string;
  name: string;
  /** A second line, such as the brand and model. */
  subtitle?: string;
  imageUrl?: string;
  /** Where clicking the item goes, such as its detail page. */
  href: string;
  /** Values per facet key, matched by the facet filters, e.g. `{ technique: ["dtg", "embroidery"] }`. */
  tags?: Record<string, string[]>;
  /** Short labels on the card, such as "New" or "12 colours". */
  badges?: string[];
  /** Store products made from this item, shown as links. When present the card is marked "In store". */
  inStore?: { label: string; href: string }[];
}

export interface CatalogGridFacet {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface CatalogGridProps {
  items: CatalogGridItem[];
  facets?: CatalogGridFacet[];
  /** Shown above the grid, such as where the list came from and when. */
  caption?: ReactNode;
  /** Items shown before "Show more". Default 60. */
  pageSize?: number;
  /** Starting search text and facet choices. */
  initial?: { search?: string; facets?: Record<string, string>; inStoreOnly?: boolean };
}

const mutedText = { fontSize: 12, color: "var(--color-text-muted, #555)" } as const;
const control = { fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderWidth: "1.5px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 6, background: "var(--color-surface, #fff)", color: "var(--color-text, #111)" } as const;

/** Keeps items whose name or subtitle has every word of the search, and that match each chosen facet. */
export function filterCatalogItems(items: CatalogGridItem[], search: string, facets: Record<string, string>, inStoreOnly = false): CatalogGridItem[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (inStoreOnly && !item.inStore?.length) return false;
    for (const [key, value] of Object.entries(facets)) {
      if (value && !item.tags?.[key]?.includes(value)) return false;
    }
    if (words.length === 0) return true;
    const text = `${item.name} ${item.subtitle ?? ""}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/**
 * Everything a provider can make, as a searchable grid: search, a select per
 * facet, an "in store only" switch, and cards that link to each item and to
 * the store products already made from it. Filtering happens here, so pass
 * the whole list.
 */
export function CatalogGrid({ items, facets = [], caption, pageSize = 60, initial = {} }: CatalogGridProps) {
  const [search, setSearch] = useState(initial.search ?? "");
  const [chosen, setChosen] = useState<Record<string, string>>(initial.facets ?? {});
  const [inStoreOnly, setInStoreOnly] = useState(initial.inStoreOnly ?? false);
  const [shown, setShown] = useState(pageSize);
  const id = useId();
  const matches = useMemo(() => filterCatalogItems(items, search, chosen, inStoreOnly), [items, search, chosen, inStoreOnly]);
  const inStoreCount = items.filter((i) => i.inStore?.length).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {caption && <p style={{ ...mutedText, fontSize: 13, margin: 0 }}>{caption}</p>}
      <div role="search" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12, flex: "1 1 220px" }} htmlFor={`${id}-search`}>
          Search
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="Name, brand or model"
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(pageSize);
            }}
            style={control}
          />
        </label>
        {facets.map((facet) => (
          <label key={facet.key} style={{ display: "grid", gap: 4, fontSize: 12 }} htmlFor={`${id}-${facet.key}`}>
            {facet.label}
            <select
              id={`${id}-${facet.key}`}
              data-facet={facet.key}
              value={chosen[facet.key] ?? ""}
              onChange={(e) => {
                setChosen({ ...chosen, [facet.key]: e.target.value });
                setShown(pageSize);
              }}
              style={control}
            >
              <option value="">All</option>
              {facet.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, paddingBottom: 6 }}>
          <input type="checkbox" checked={inStoreOnly} onChange={(e) => setInStoreOnly(e.target.checked)} />
          In store only ({inStoreCount})
        </label>
      </div>
      <p aria-live="polite" style={{ ...mutedText, margin: 0 }}>
        {matches.length} of {items.length} shown{matches.length > shown ? ` (first ${shown})` : ""}
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 180px), 1fr))" }}>
        {matches.slice(0, shown).map((item) => (
          <li key={item.id} data-item={item.id} style={{ display: "grid", gap: 6, alignContent: "start", borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)", borderRadius: 8, padding: 10, background: "var(--color-surface, #fff)" }}>
            <a href={item.href} style={{ color: "inherit", textDecoration: "none", display: "grid", gap: 6 }}>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", borderRadius: 6, background: "var(--color-background, #f6f6f6)" }} />
              ) : (
                <span aria-hidden style={{ aspectRatio: "1", borderRadius: 6, background: "var(--color-background, #f6f6f6)" }} />
              )}
              <b style={{ fontSize: 14, lineHeight: 1.3 }}>{item.name}</b>
            </a>
            {item.subtitle && <span style={mutedText}>{item.subtitle}</span>}
            {(item.badges?.length || item.inStore?.length) ? (
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {item.inStore?.length ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--color-primary, #333)", color: "var(--color-on-primary, #fff)" }}>In store</span> : null}
                {item.badges?.map((b) => (
                  <span key={b} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, borderWidth: "1px", borderStyle: "solid", borderColor: "var(--color-border, #ccc)" }}>
                    {b}
                  </span>
                ))}
              </span>
            ) : null}
            {item.inStore?.map((link) => (
              <a key={link.href} href={link.href} style={{ fontSize: 12 }}>
                {link.label}
              </a>
            ))}
          </li>
        ))}
      </ul>
      {matches.length > shown && (
        <button type="button" onClick={() => setShown(shown + pageSize)} style={{ ...control, justifySelf: "start", cursor: "pointer", fontWeight: 600 }}>
          Show more
        </button>
      )}
    </div>
  );
}
