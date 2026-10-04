import "server-only";

import { getEnv } from "@/lib/env";

import { mockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export * from "./types";

export function getPaymentProvider(name: string = getEnv().PAYMENT_PROVIDER): PaymentProvider {
  switch (name) {
    case "mock":
      return mockPaymentProvider;
    default:
      throw new Error(`PAYMENT_PROVIDER desconhecido: ${name}`);
  }
}
