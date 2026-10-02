export type ChargeStatus = "pending" | "paid" | "refunded" | "failed";

export type CreatePixChargeInput = {
  amountCents: number;
  description: string;
  /** Identificador do pedido no nosso sistema; torna a cobrança idempotente. */
  reference: string;
  expiresAt: Date;
};

export type PixCharge = {
  providerChargeId: string;
  status: ChargeStatus;
  pixCopyPaste: string;
  expiresAt: Date;
};

export type CreateCardChargeInput = {
  amountCents: number;
  description: string;
  reference: string;
  installments: number;
  cardToken: string;
};

export type CardCharge = { providerChargeId: string; status: ChargeStatus };

export type RefundInput = { providerChargeId: string; amountCents?: number };

export type Refund = { providerRefundId: string; status: "refunded" };

export type PaymentWebhookEvent = {
  providerEventId: string;
  type: "charge.paid" | "charge.refunded" | "charge.failed";
  providerChargeId: string;
};

export class PaymentWebhookError extends Error {
  constructor() {
    super("Webhook de pagamento inválido.");
    this.name = "PaymentWebhookError";
  }
}

export interface PaymentProvider {
  readonly name: string;
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
  createCardCharge(input: CreateCardChargeInput): Promise<CardCharge>;
  refund(input: RefundInput): Promise<Refund>;
  /** Valida a assinatura do provedor e devolve o evento; lança `PaymentWebhookError` se inválido. */
  parseWebhook(request: { headers: Headers; body: string }): Promise<PaymentWebhookEvent>;
}
