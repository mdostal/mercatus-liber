import type { Bundle } from "@mercatus-liber/bundles";

/** Fixed, generous number of tier slots this plain-HTML form supports -- see bundle-03's story spec. */
const TIER_SLOTS = 5;

/**
 * The text/select inputs shared by the create and edit bundle forms.
 * Plain server-rendered fields, no client-side validation library or
 * dynamic add-row JS -- matches this app's zero-client-JS-framework posture
 * (same reasoning as PromotionFormFields). A bundle's tiers are posted as a
 * fixed number of indexed slots (tier_0_label/tier_0_skuIds/tier_0_id, ...);
 * empty slots (blank label AND blank skuIds) are simply omitted server-side
 * when parsed -- see parseBundleFormData in lib/actions.ts. Each tier's
 * skuIds is one comma-or-newline-separated textarea, generous enough to
 * hold several SKU ids per tier.
 */
export function BundleFormFields({ bundle }: { bundle?: Bundle }) {
  return (
    <>
      <p>
        <label>
          Base product id
          <br />
          <input type="text" name="productId" defaultValue={bundle?.productId ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Title
          <br />
          <input type="text" name="title" defaultValue={bundle?.title ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Status
          <br />
          <select name="status" defaultValue={bundle?.status ?? "active"}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
      </p>
      <h2>Tiers</h2>
      <p style={{ color: "#666" }}>
        Fill in as many of the {TIER_SLOTS} tier slots below as this bundle needs (at least one). Leave a
        slot&apos;s label and SKU ids both blank to omit it. Enter SKU ids comma- or newline-separated.
      </p>
      {Array.from({ length: TIER_SLOTS }, (_, i) => {
        const tier = bundle?.tiers[i];
        return (
          <fieldset key={i} style={{ marginBottom: "1em" }}>
            <legend>Tier {i + 1}</legend>
            <input type="hidden" name={`tier_${i}_id`} value={tier?.id ?? ""} />
            <p>
              <label>
                Label
                <br />
                <input type="text" name={`tier_${i}_label`} defaultValue={tier?.label ?? ""} />
              </label>
            </p>
            <p>
              <label>
                SKU ids (comma- or newline-separated)
                <br />
                <textarea name={`tier_${i}_skuIds`} rows={3} defaultValue={tier?.skuIds.join("\n") ?? ""} />
              </label>
            </p>
          </fieldset>
        );
      })}
    </>
  );
}
