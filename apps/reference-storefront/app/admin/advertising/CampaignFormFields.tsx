import type { Campaign } from "@mercatus-liber/advertising";

/** Fixed, generous number of creative slots this plain-HTML form supports -- mirrors BundleFormFields' TIER_SLOTS convention, see ad-03's story spec. */
const CREATIVE_SLOTS = 5;

/**
 * The text/select inputs shared by the create and edit campaign forms.
 * Plain server-rendered fields, no client-side validation library or
 * dynamic add-row JS -- matches this app's zero-client-JS-framework posture
 * (same reasoning as BundleFormFields/PromotionFormFields). A campaign's
 * creatives are posted as a fixed number of indexed slots
 * (creative_0_headline/creative_0_body/creative_0_imageUrl/
 * creative_0_linkHref/creative_0_weight/creative_0_id, ...); a slot with a
 * blank headline, body, AND linkHref is treated as unused and omitted
 * server-side when parsed -- see parseCampaignFormData in lib/actions.ts.
 */
export function CampaignFormFields({ campaign }: { campaign?: Campaign }) {
  return (
    <>
      <p>
        <label>
          Name
          <br />
          <input type="text" name="name" defaultValue={campaign?.name ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Starts at (blank = active immediately)
          <br />
          <input type="datetime-local" name="startsAt" defaultValue={campaign?.startsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Ends at (blank = no expiry)
          <br />
          <input type="datetime-local" name="endsAt" defaultValue={campaign?.endsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Service area id (blank = untargeted, matches every service area)
          <br />
          <input type="text" name="serviceAreaId" defaultValue={campaign?.targeting.serviceAreaId ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Page slug (blank = untargeted, matches every page)
          <br />
          <input type="text" name="pageSlug" defaultValue={campaign?.targeting.pageSlug ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Status
          <br />
          <select name="status" defaultValue={campaign?.status ?? "active"}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
      </p>
      <h2>Creatives</h2>
      <p style={{ color: "#666" }}>
        Fill in as many of the {CREATIVE_SLOTS} creative slots below as this campaign needs (at least one).
        Leave a slot&apos;s headline, body, AND link href all blank to omit it.
      </p>
      {Array.from({ length: CREATIVE_SLOTS }, (_, i) => {
        const creative = campaign?.creatives[i];
        return (
          <fieldset key={i} style={{ marginBottom: "1em" }}>
            <legend>Creative {i + 1}</legend>
            <input type="hidden" name={`creative_${i}_id`} value={creative?.id ?? ""} />
            <p>
              <label>
                Headline
                <br />
                <input type="text" name={`creative_${i}_headline`} defaultValue={creative?.headline ?? ""} />
              </label>
            </p>
            <p>
              <label>
                Body
                <br />
                <textarea name={`creative_${i}_body`} rows={3} defaultValue={creative?.body ?? ""} />
              </label>
            </p>
            <p>
              <label>
                Image URL (blank = none)
                <br />
                <input type="text" name={`creative_${i}_imageUrl`} defaultValue={creative?.imageUrl ?? ""} />
              </label>
            </p>
            <p>
              <label>
                Link href
                <br />
                <input type="text" name={`creative_${i}_linkHref`} defaultValue={creative?.linkHref ?? ""} />
              </label>
            </p>
            <p>
              <label>
                Weight (blank = default 1)
                <br />
                <input type="number" name={`creative_${i}_weight`} defaultValue={creative?.weight ?? ""} />
              </label>
            </p>
          </fieldset>
        );
      })}
    </>
  );
}
