/** A form's server action, in the shape React's `<form action>` takes. */
export type FormAction = (formData: FormData) => void | Promise<void>;

/** Where a store lives, so templates aren't tied to one app's routes. */
export interface StoreContext {
  /** The path every store link starts with, such as "" or "/demo/print-shop". No trailing slash. */
  basePath: string;
  /** Extra hidden fields for every form, for an app whose actions need them, such as which store this is. */
  formFields?: Record<string, string>;
}

export interface CartActions {
  updateCartItemQuantity: FormAction;
  removeCartItem: FormAction;
  applyCoupon: FormAction;
  startCheckout: FormAction;
}

export interface PdpActions {
  addToCart: FormAction;
  submitReview: FormAction;
}

export function StoreFields({ store }: { store: StoreContext }) {
  return (
    <>
      {Object.entries(store.formFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}
