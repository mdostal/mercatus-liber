import type { Catalog } from "@mercatus-liber/catalog";
import { utcToZonedLocal } from "../lib/store-time";

/** The fields of a line, for creating or editing. Times are in the store's time zone. */
export function LineFormFields({ demoSlug, line, sectionsText, timeZone }: { demoSlug: string; line?: Catalog; sectionsText?: string; timeZone: string }) {
  const field = { display: "grid", gap: 4, marginBottom: 12, maxWidth: 560 } as const;
  return (
    <>
      <input type="hidden" name="demoSlug" value={demoSlug} />
      {line ? <input type="hidden" name="id" value={line.id} /> : null}
      {!line ? (
        <label style={field}>
          Slug (the line's URL)
          <input name="slug" required pattern="[a-z0-9][a-z0-9-]*" placeholder="frost" />
        </label>
      ) : null}
      <label style={field}>
        Name
        <input name="name" required defaultValue={line?.name ?? ""} />
      </label>
      <label style={field}>
        Description
        <textarea name="description" rows={2} defaultValue={line?.description ?? ""} />
      </label>
      <label style={field}>
        Status
        <select name="status" defaultValue={line?.status ?? "active"}>
          <option value="active">Active (shown)</option>
          <option value="draft">Draft (hidden)</option>
        </select>
      </label>
      <label style={field}>
        Opens ({timeZone}; empty for open now)
        <input type="datetime-local" name="activeFrom" defaultValue={utcToZonedLocal(line?.activeFrom ?? null, timeZone)} />
      </label>
      <label style={field}>
        Closes ({timeZone}; empty for no end)
        <input type="datetime-local" name="activeTo" defaultValue={utcToZonedLocal(line?.activeTo ?? null, timeZone)} />
      </label>
      <label style={field}>
        Hero title
        <input name="heroTitle" defaultValue={line?.hero?.title ?? ""} />
      </label>
      <label style={field}>
        Hero subtitle
        <input name="heroSubtitle" defaultValue={line?.hero?.subtitle ?? ""} />
      </label>
      <label style={field}>
        Hero image URL
        <input name="heroImage" type="url" defaultValue={line?.hero?.imageUrl ?? ""} />
      </label>
      <label style={field}>
        Sections, one per line: slug | Title | product-slug, product-slug
        <textarea name="sections" rows={5} defaultValue={sectionsText ?? ""} placeholder={"desk | Desk | frost-mat\nshirts | Shirts | frost-tee\nhats | Hats |"} style={{ fontFamily: "var(--font-mono, monospace)" }} />
      </label>
    </>
  );
}
