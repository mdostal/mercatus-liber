import type { RecommendationRule } from "@mercatus-liber/recommendations";

/**
 * The text/select/textarea inputs shared by the create and edit recommendation
 * forms. Plain server-rendered fields, no client-side validation library or
 * product picker -- matches this app's zero-client-JS-framework posture (same
 * reasoning as BundleFormFields/PromotionFormFields). sourceProductId and
 * targetProductIds are entered as raw text ids/slugs, never validated against
 * catalog here (see rec-03's design_decisions and packages/recommendations'
 * own deliberate no-catalog-validation posture). targetProductIds is a single
 * comma-or-newline-separated textarea, parsed server-side in lib/actions.ts.
 */
export function RecommendationFormFields({ rule }: { rule?: RecommendationRule }) {
  return (
    <>
      <p>
        <label>
          Source product id
          <br />
          <input type="text" name="sourceProductId" defaultValue={rule?.sourceProductId ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Label
          <br />
          <input type="text" name="label" defaultValue={rule?.label ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Placement
          <br />
          <select name="placement" defaultValue={rule?.placement ?? "both"}>
            <option value="pdp">pdp</option>
            <option value="cart">cart</option>
            <option value="both">both</option>
          </select>
        </label>
      </p>
      <p>
        <label>
          Target product ids (comma- or newline-separated)
          <br />
          <textarea
            name="targetProductIds"
            rows={5}
            defaultValue={rule?.targetProductIds.join("\n") ?? ""}
            required
          />
        </label>
      </p>
      <p>
        <label>
          Status
          <br />
          <select name="status" defaultValue={rule?.status ?? "active"}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
      </p>
    </>
  );
}
