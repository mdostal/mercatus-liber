import type { StorefrontView } from "@mercatus-liber/storefront-views";

/**
 * gap-audit-3-storefront-view-edit: the text/select/checkbox inputs shared
 * by the create and edit storefront-view forms -- same
 * "extract a *FormFields component once there's a second form" precedent as
 * PromotionFormFields.tsx (admin/promotions), reused here now that
 * updateStorefrontViewAction's edit page needs the exact same fields,
 * pre-filled, that the create form on the list page already has. Plain
 * server-rendered fields, no client-side validation library -- same
 * zero-client-JS-framework posture as every other admin form in this repo.
 */
export function StorefrontViewFormFields({ view }: { view?: StorefrontView }) {
  return (
    <>
      <p>
        <label>
          Slug (becomes /site/&lt;slug&gt;)
          <br />
          <input type="text" name="slug" defaultValue={view?.slug ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Name
          <br />
          <input type="text" name="name" defaultValue={view?.name ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Hero headline
          <br />
          <input type="text" name="heroHeadline" defaultValue={view?.heroHeadline ?? ""} required />
        </label>
      </p>
      <p>
        <label>
          Hero subheadline
          <br />
          <input type="text" name="heroSubheadline" defaultValue={view?.heroSubheadline ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Category ids (comma-separated, this store's own real category ids)
          <br />
          <input type="text" name="categoryIds" defaultValue={view?.categoryIds.join(", ") ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Theme key override (blank = inherit the store's current theme)
          <br />
          <input type="text" name="themeKey" defaultValue={view?.themeKey ?? ""} />
        </label>
      </p>
      <p>
        <label>
          <input type="checkbox" name="isDefaultOverride" defaultChecked={view?.isDefaultOverride ?? false} /> Replace
          the store's home page while this view is live
        </label>
      </p>
      <p>
        <label>
          Starts at (blank = live as soon as published)
          <br />
          <input type="datetime-local" name="startsAt" defaultValue={view?.startsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
      <p>
        <label>
          Ends at (blank = no expiry)
          <br />
          <input type="datetime-local" name="endsAt" defaultValue={view?.endsAt?.slice(0, 16) ?? ""} />
        </label>
      </p>
    </>
  );
}
