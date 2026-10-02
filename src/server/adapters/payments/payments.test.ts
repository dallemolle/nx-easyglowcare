import { describe, expect, it } from "vitest";

import { getPaymentProvider } from "./index";
import { mockPaymentProvider } from "./mock";
import { PaymentWebhookError } from "./types";

const EXPIRES = new Date("2026-10-03T12:00:00Z");
const pix = { amountCents: 5000, description: "Sinal", reference: "pedido-1", expiresAt: EXPIRES };

describe("getPaymentProvider", () => {
  it("devolve o mock por padrão; valor desconhecido cita a variável", () => {
    expect(getPaymentProvider()).toBe(mockPaymentProvider);
    expect(() => getPaymentProvider("asaas")).toThrow(/PAYMENT_PROVIDER/);
  });
});

describe("mockPaymentProvider", () => {
  it("createPixCharge é determinístico a partir da entrada", async () => {
    const a = await mockPaymentProvider.createPixCharge(pix);
    const b = await mockPaymentProvider.createPixCharge(pix);
    const other = await mockPaymentProvider.createPixCharge({ ...pix, reference: "pedido-2" });

    expect(a).toEqual(b);
    expect(a.status).toBe("pending");
    expect(a.expiresAt).toEqual(EXPIRES);
    expect(a.pixCopyPaste).toContain(a.providerChargeId);
    expect(other.providerChargeId).not.toBe(a.providerChargeId);
  });

  it("createCardCharge devolve cobrança paga e determinística", async () => {
    const input = {
      amountCents: 30000,
      description: "Pacote",
      reference: "pedido-3",
      installments: 3,
      cardToken: "tok_teste",
    };
    const a = await mockPaymentProvider.createCardCharge(input);
    expect(a).toEqual(await mockPaymentProvider.createCardCharge(input));
    expect(a.status).toBe("paid");
  });

  it("refund devolve o estorno da cobrança informada", async () => {
    const refund = await mockPaymentProvider.refund({ providerChargeId: "mock_ch_abc" });
    expect(refund).toEqual({ providerRefundId: "mock_re_abc", status: "refunded" });
  });

  it("parseWebhook lê o evento do corpo JSON", async () => {
    const event = await mockPaymentProvider.parseWebhook({
      headers: new Headers(),
      body: JSON.stringify({ eventId: "evt_1", type: "charge.paid", chargeId: "mock_ch_abc" }),
    });
    expect(event).toEqual({
      providerEventId: "evt_1",
      type: "charge.paid",
      providerChargeId: "mock_ch_abc",
    });
  });

  it.each([["não é json"], [JSON.stringify({ eventId: "evt_1" })], [JSON.stringify({ eventId: "e", type: "x", chargeId: "c" })]])(
    "parseWebhook recusa corpo inválido (%s)",
    async (body) => {
      await expect(
        mockPaymentProvider.parseWebhook({ headers: new Headers(), body }),
      ).rejects.toBeInstanceOf(PaymentWebhookError);
    },
  );
});
