"use client";

import { useState } from "react";
import type { ComponentDefinition, ComponentFieldSchema, ComponentInstance } from "@mercatus-liber/cms";

/** Fixed, generous number of section slots this plain-HTML form supports -- mirrors BundleFormFields' tier-slot convention (see cms-crud-01's story spec / design-discussion.md §3). Must match CMS_SECTION_SLOTS in lib/actions.ts. */
export const CMS_SECTION_SLOTS = 6;

/** One selectable option for a productRef/categoryRef `<select multiple>` -- `value` is the real identifier stored in config (a category's slug, or a product's id -- see catalog/marketing-catalog service shapes), `label` is what an admin sees. */
export interface CmsRefOption {
  value: string;
  label: string;
}

function fieldInputName(slotIndex: number, key: string): string {
  return `section_${slotIndex}_field_${key}`;
}

/**
 * scc-02's ComponentFieldSchema has no separate "this text field is really a
 * list" flag by design (see packages/cms/src/types.ts's own doc comment on
 * ComponentFieldSchema) -- every field whose real grounded usage is a list
 * (see component-registry.ts's fields[]) documents that in its own helpText
 * with the word "array" (categorySlugs/productIds/servicesOffered all do;
 * scalar fields like headline/subheadline/hours/blurb never do). This reads
 * that same signal rather than hardcoding field keys, so it generalizes to
 * any future field whose author follows the same convention.
 */
function isListTextField(field: ComponentFieldSchema): boolean {
  return (field.kind === "text" || field.kind === "richtext") && !!field.helpText && /array/i.test(field.helpText);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

function FieldHelp({ field }: { field: ComponentFieldSchema }) {
  if (!field.helpText) return null;
  return (
    <>
      <br />
      <small style={{ color: "#666" }}>{field.helpText}</small>
    </>
  );
}

function FieldLabel({ field }: { field: ComponentFieldSchema }) {
  return (
    <>
      {field.label}
      {field.required ? " *" : ""}
      <br />
    </>
  );
}

/**
 * One real, typed input for one field of scc-02's ComponentFieldSchema --
 * replaces the old whole-slot raw-JSON textarea. `initialValue` is that
 * field's current value from ComponentInstance.config (undefined for a
 * brand-new/blank slot, or when the admin has just switched this slot to a
 * different componentType than the one it started as -- see
 * CmsSectionFields' `key`-forced-remount below).
 */
function TypedField({
  slotIndex,
  field,
  initialValue,
  categoryOptions,
  productOptions,
}: {
  slotIndex: number;
  field: ComponentFieldSchema;
  initialValue: unknown;
  categoryOptions: CmsRefOption[];
  productOptions: CmsRefOption[];
}) {
  const name = fieldInputName(slotIndex, field.key);

  switch (field.kind) {
    case "richtext":
      return (
        <p>
          <label>
            <FieldLabel field={field} />
            <textarea
              name={name}
              rows={4}
              required={field.required}
              defaultValue={typeof initialValue === "string" ? initialValue : ""}
            />
          </label>
          <FieldHelp field={field} />
        </p>
      );

    case "number":
      return (
        <p>
          <label>
            <FieldLabel field={field} />
            <input
              type="number"
              name={name}
              required={field.required}
              defaultValue={typeof initialValue === "number" ? initialValue : ""}
            />
          </label>
          <FieldHelp field={field} />
        </p>
      );

    case "boolean":
      return (
        <p>
          <label>
            <input type="checkbox" name={name} defaultChecked={initialValue === true} /> {field.label}
            {field.required ? " *" : ""}
          </label>
          <FieldHelp field={field} />
        </p>
      );

    case "categoryRef":
    case "productRef": {
      // Real, grounded usage (see component-registry.ts's fields[] doc
      // comment): every categoryRef/productRef field in this schema is an
      // ARRAY of references (categorySlugs/productIds), never a single one
      // -- so this always renders a real multi-select, never a
      // single-selection dropdown, populated from the live catalog/
      // marketing-catalog data this demo's page passed down (not free-text
      // ID input).
      const options = field.kind === "categoryRef" ? categoryOptions : productOptions;
      const selected = toStringArray(initialValue);
      return (
        <p>
          <label>
            <FieldLabel field={field} />
            <select
              name={name}
              multiple
              required={field.required}
              size={Math.min(8, Math.max(3, options.length || 3))}
              defaultValue={selected}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <FieldHelp field={field} />
        </p>
      );
    }

    case "image":
      return (
        <p>
          <label>
            <FieldLabel field={field} />
            <input
              type="text"
              name={name}
              placeholder="https://..."
              required={field.required}
              defaultValue={typeof initialValue === "string" ? initialValue : ""}
            />
          </label>
          <FieldHelp field={field} />
        </p>
      );

    case "text":
    default: {
      if (isListTextField(field)) {
        // e.g. service-area-info's servicesOffered -- an array of strings,
        // one per line (comma-separated also accepted), same split(/[,\n]/)
        // convention parseBundleFormData already uses for tier skuIds (see
        // lib/actions.ts).
        return (
          <p>
            <label>
              <FieldLabel field={field} />
              <textarea
                name={name}
                rows={3}
                required={field.required}
                defaultValue={toStringArray(initialValue).join("\n")}
              />
            </label>
            <FieldHelp field={field} />
          </p>
        );
      }
      return (
        <p>
          <label>
            <FieldLabel field={field} />
            <input
              type="text"
              name={name}
              required={field.required}
              defaultValue={typeof initialValue === "string" ? initialValue : ""}
            />
          </label>
          <FieldHelp field={field} />
        </p>
      );
    }
  }
}

/**
 * The section-slot editor shared by the new-page, new-marketing-page, and
 * edit forms. A ComponentInstance's `config` is `Record<string, unknown>` by
 * design -- opaque to CMS itself, since each componentType (hero-banner/
 * category-spot/product-grid/ad-slot/service-area-info) has a different
 * config shape (see docs/subsystems/05-cms-pages.md). Rather than a raw-JSON
 * textarea for the whole config blob, this renders a fixed number of section
 * slots, each with a componentType <select> (populated from
 * `cms.components.list()`) and -- once a componentType is chosen -- one real
 * typed input per field in that type's scc-02 ComponentFieldSchema `fields[]`
 * (text/richtext/number/boolean/image/productRef/categoryRef), parsed
 * server-side by name into the reassembled config object -- see
 * parseCmsSectionFormData in lib/actions.ts. A slot with a blank
 * componentType is treated as unused and omitted when parsed. A slot with a
 * componentType whose `fields` is empty (ad-slot, deliberately -- see
 * component-registry.ts) renders no fields at all, same as before.
 *
 * This is a client component (the repo's first in admin/) specifically so
 * switching a slot's componentType <select> re-renders that slot's fields
 * immediately, without a full page round-trip -- the literal ask this story
 * exists for ("swapping layouts" via typed fields, not hand-edited JSON).
 * Each slot's field inputs are uncontrolled (defaultValue only); the
 * `key={selectedType}` below forces React to remount (never leaks a stale
 * defaultValue from the previous componentType) when a slot's type changes.
 */
export function CmsSectionFields({
  componentTypes,
  sections,
  categoryOptions,
  productOptions,
}: {
  componentTypes: ComponentDefinition[];
  sections?: ComponentInstance[];
  categoryOptions: CmsRefOption[];
  productOptions: CmsRefOption[];
}) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() =>
    Array.from({ length: CMS_SECTION_SLOTS }, (_, i) => sections?.[i]?.componentType ?? ""),
  );

  return (
    <>
      <h2>Sections</h2>
      <p style={{ color: "#666" }}>
        Fill in as many of the {CMS_SECTION_SLOTS} section slots below as this page needs. Leave a slot&apos;s
        component type blank to omit it. Choosing a component type shows that type&apos;s real fields below it.
      </p>
      {Array.from({ length: CMS_SECTION_SLOTS }, (_, i) => {
        const section = sections?.[i];
        const selectedType = selectedTypes[i] ?? "";
        const definition = componentTypes.find((def) => def.type === selectedType) ?? null;
        // Only trust the original section's config as field defaults while
        // the slot's type hasn't been changed away from what it started as
        // -- switching to a different type mid-edit must start that type's
        // fields blank, never show a stale value from the previous type.
        const configForDefaults = selectedType === (section?.componentType ?? "") ? (section?.config ?? {}) : {};

        return (
          <fieldset key={i} style={{ marginBottom: "1em" }}>
            <legend>Section {i + 1}</legend>
            <p>
              <label>
                Component type
                <br />
                <select
                  name={`section_${i}_componentType`}
                  value={selectedType}
                  onChange={(e) => {
                    const next = [...selectedTypes];
                    next[i] = e.target.value;
                    setSelectedTypes(next);
                  }}
                >
                  <option value="">(none)</option>
                  {componentTypes.map((def) => (
                    <option key={def.type} value={def.type}>
                      {def.label} ({def.type})
                    </option>
                  ))}
                </select>
              </label>
            </p>
            {definition && definition.fields && definition.fields.length > 0 ? (
              <div key={selectedType}>
                {definition.fields.map((field) => (
                  <TypedField
                    key={field.key}
                    slotIndex={i}
                    field={field}
                    initialValue={configForDefaults[field.key]}
                    categoryOptions={categoryOptions}
                    productOptions={productOptions}
                  />
                ))}
              </div>
            ) : definition ? (
              <p style={{ color: "#666" }}>
                <em>{definition.label} has no configurable fields.</em>
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </>
  );
}
