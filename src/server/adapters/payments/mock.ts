import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { PaymentWebhookError, type PaymentProvider } from "./types";

function fakeId(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

const webhookSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(["charge.paid", "charge.refunded", "charge.failed"]),
  chargeId: z.string().min(1),
});

/** Implementação de desenvolvimento: respostas falsas e determinísticas, sem rede. */
export const mockPaymentProvider: PaymentProvider = {
  name: "mock",

  async createPixCharge({ amountCents, reference, expiresAt }) {
    const providerChargeId = fakeId("mock_ch", "pix", reference, amountCents);
    return {
      providerChargeId,
      status: "pending",
      pixCopyPaste: `00020126MOCK${providerChargeId}`,
      expiresAt,
    };
  },

  async createCardCharge({ amountCents, reference, installments }) {
    return {
      providerChargeId: fakeId("mock_ch", "card", reference, amountCents, installments),
      status: "paid",
    };
  },

  async refund({ providerChargeId }) {
    return { providerRefundId: providerChargeId.replace(/^mock_ch_/, "mock_re_"), status: "refunded" };
  },

  async parseWebhook({ body }) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new PaymentWebhookError();
    }
    const parsed = webhookSchema.safeParse(json);
    if (!parsed.success) throw new PaymentWebhookError();
    return {
      providerEventId: parsed.data.eventId,
      type: parsed.data.type,
      providerChargeId: parsed.data.chargeId,
    };
  },
};
