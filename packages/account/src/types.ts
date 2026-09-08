export interface CustomerProfile {
  id: string;
  email: string;
  name: string;
}

export interface CustomerProfileRepository {
  get(id: string): Promise<CustomerProfile | null>;
  getByEmail(email: string): Promise<CustomerProfile | null>;
  save(profile: CustomerProfile): Promise<void>;
}

export interface OrderSummary {
  id: string;
  status: string;
  itemCount: number;
}

/**
 * The narrowest read dependency this package has on order data -- a
 * structural interface, not an import of @mercatus-liber/checkout-orders.
 * @mercatus-liber/checkout-orders' CheckoutOrdersService-plus-repository
 * combination satisfies this shape; the reference storefront wires a small
 * adapter object over its concrete OrderRepository (see acct-02).
 */
export interface OrderLookup {
  getOrder(
    id: string,
  ): Promise<{ id: string; customerId: string | null; status: string; items: { skuId: string; quantity: number }[] } | null>;
  listOrdersByCustomer(
    customerId: string,
  ): Promise<{ id: string; status: string; items: { skuId: string; quantity: number }[] }[]>;
}

export interface ActivityEntry {
  orderId: string;
  status: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export class CustomerNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer profile not found: ${id}`);
    this.name = "CustomerNotFoundError";
  }
}
