import type { Money } from "@mercatus-liber/core";

export interface PaymentLineItem {
  name: string;
  unitAmount: Money;
  quantity: number;
}

export interface CreatePaymentSessionInput {
  orderRef: string;
  lineItems: PaymentLineItem[];
  successUrl: string;
  cancelUrl: string;
  /** Charged on top of the line items and shown as shipping. */
  shipping?: { label: string; amount: Money };
  /**
   * Have the hosted checkout page collect the shipping address (with the
   * provider's own address lookup and validation) instead of the store.
   * The address arrives on the payments.payment.succeeded event.
   */
  collectShippingAddress?: {
    /** ISO 3166-1 alpha-2 codes the shopper may ship to. Pass the one country the shipping was quoted for. */
    allowedCountries: string[];
    /** Also ask for a phone number. */
    phone?: boolean;
  };
  /** Prefill the shopper's email on the checkout page. */
  customerEmail?: string;
}

/** An address the payment provider collected on its checkout page. */
export interface CollectedShippingAddress {
  name: string | null;
  line1: string;
  line2: string | null;
  city: string;
  /** As the provider gave it: Stripe sends US states as codes ("NE"). */
  state: string | null;
  postalCode: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
}

/** The payload of payments.payment.succeeded and payments.payment.failed. */
export interface PaymentEvent {
  sessionId: string;
  orderRef: string | null;
  /** Who paid, as the checkout page collected them. Present when the provider reports it. */
  customer?: { name: string | null; email: string | null; phone: string | null };
  /** Present when the checkout page collected a shipping address. */
  shippingAddress?: CollectedShippingAddress;
}

export interface PaymentSession {
  sessionId: string;
  redirectUrl: string;
}

export type PaymentStatus = "paid" | "unpaid" | "no_payment_required";

export interface PaymentConfirmation {
  status: PaymentStatus;
  orderRef: string | null;
}

/**
 * The adapter interface every payment provider implements (subsystem 08). Never
 * exposes or accepts raw card data -- createPaymentSession returns a redirect to
 * the provider's own hosted checkout UI, which owns PCI scope and tax
 * calculation entirely.
 */
export interface PaymentAdapter {
  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession>;
  confirmPayment(sessionId: string): Promise<PaymentConfirmation>;
  /**
   * Verifies and processes a provider webhook payload. Implementations MUST
   * verify the signature before trusting the payload (never trust an
   * unverified webhook body). Publishes payments.payment.succeeded /
   * payments.payment.failed on the injected EventBus -- callers don't need to
   * inspect the raw provider event shape.
   */
  handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void>;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}
