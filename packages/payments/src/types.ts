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
