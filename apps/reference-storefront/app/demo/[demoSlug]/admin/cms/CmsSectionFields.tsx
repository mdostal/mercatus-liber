import type { ComponentDefinition, ComponentInstance } from "@mercatus-liber/cms";

/** Fixed, generous number of section slots this plain-HTML form supports -- mirrors BundleFormFields' tier-slot convention (see cms-crud-01's story spec / design-discussion.md §3). */
export const CMS_SECTION_SLOTS = 6;

/**
 * The section-slot editor shared by the new-page, new-marketing-page, and
 * edit forms. A ComponentInstance's `config` is `Record<string, unknown>` by
 * design -- opaque to CMS itself, since each componentType (hero-banner/
 * category-spot/product-grid/ad-slot/service-area-info) has a different
 * config shape (see docs/subsystems/05-cms-pages.md). Rather than building a
 * separate typed editor per componentType, this renders a fixed number of
 * section slots, each with a componentType <select> (populated from
 * `cms.components.list()`) and a raw-JSON <textarea> for that slot's config,
 * parsed server-side with a clear per-slot error on invalid JSON -- see
 * parseCmsSectionFormData in lib/actions.ts. A slot with a blank
 * componentType is treated as unused and omitted when parsed.
 */
export function CmsSectionFields({
  componentTypes,
  sections,
}: {
  componentTypes: ComponentDefinition[];
  sections?: ComponentInstance[];
}) {
  return (
    <>
      <h2>Sections</h2>
      <p style={{ color: "#666" }}>
        Fill in as many of the {CMS_SECTION_SLOTS} section slots below as this page needs. Leave a slot&apos;s
        component type blank to omit it. Config is raw JSON matching the chosen component&apos;s expected shape.
      </p>
      {Array.from({ length: CMS_SECTION_SLOTS }, (_, i) => {
        const section = sections?.[i];
        return (
          <fieldset key={i} style={{ marginBottom: "1em" }}>
            <legend>Section {i + 1}</legend>
            <p>
              <label>
                Component type
                <br />
                <select name={`section_${i}_componentType`} defaultValue={section?.componentType ?? ""}>
                  <option value="">(none)</option>
                  {componentTypes.map((def) => (
                    <option key={def.type} value={def.type}>
                      {def.label} ({def.type})
                    </option>
                  ))}
                </select>
              </label>
            </p>
            <p>
              <label>
                Config (JSON)
                <br />
                <textarea
                  name={`section_${i}_config`}
                  rows={3}
                  defaultValue={section ? JSON.stringify(section.config) : ""}
                />
              </label>
            </p>
          </fieldset>
        );
      })}
    </>
  );
}
