import type { Promotion } from "@mercatus-liber/promotions";

/**
 * The text/select inputs shared by the create and edit promotion forms.
 * Plain server-rendered fields, no client-side validation library -- matches
 * this app's zero-client-JS-framework posture (see design_decisions in
 * promo-04's story spec).
 */
export function PromotionFormFields({ promotion }: { promotion?: Promotion }) {
  return (
    <>
      <p>
        <label>
          Code (blank = auto-applied, no coupon code needed)
          <br />
          <input type="text" name="code" defaultValue={promotion?.code ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Kind
          <br />
          <select name="kind" defaultValue={promotion?.kind ?? "percentage"}>
            <option value="percentage">percentage</option>
            <option value="fixed">fixed</option>
          </select>
        </label>
      </p>
      <p>
        <label>
          Scope
          <br />
          <select name="scope" defaultValue={promotion?.scope ?? "cart"}>
            <option value="cart">cart</option>
            <option value="product">product</option>
          </select>
        </label>
      </p>
      <p>
        <label>
          Value (percentage: 0-100; fixed: minor-unit amount)
          <br />
          <input type="number" name="value" defaultValue={promotion?.value ?? 0} required />
        </label>
      </p>
      <p>
        <label>
          Currency
          <br />
          <input type="text" name="currency" defaultValue={promotion?.currency ?? "USD"} />
        </label>
      </p>
      <p>
        <label>
          Target SKU ids (comma-separated, product scope only)
          <br />
          <input type="text" name="targetSkuIds" defaultValue={promotion?.targetSkuIds.join(", ") ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Minimum cart amount (minor units, blank = none, cart scope only)
          <br />
          <input type="number" name="minCartAmount" defaultValue={promotion?.minCartAmount?.amount ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Starts at (blank = active immediately)
          <br />
          <input type="datetime-local" name="startsAt" defaultValue={promotion?.startsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Ends at (blank = no expiry)
          <br />
          <input type="datetime-local" name="endsAt" defaultValue={promotion?.endsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Usage limit (blank = unlimited)
          <br />
          <input type="number" name="usageLimit" defaultValue={promotion?.usageLimit ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Status
          <br />
          <select name="status" defaultValue={promotion?.status ?? "active"}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
      </p>
    </>
  );
}
