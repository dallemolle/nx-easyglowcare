import "server-only";

import { randomUUID } from "node:crypto";

import { maskRecipient } from "@/lib/format";

import type { MessagingProvider } from "./types";

/** Implementação de desenvolvimento: "envia" imprimindo no terminal, sem dado pessoal. */
export const consoleMessagingProvider: MessagingProvider = {
  name: "console",

  async sendOtp({ channel, recipient, code }) {
    // Em dev o terminal É o canal de entrega do código; em produção ele nunca é impresso.
    const shown = process.env.NODE_ENV === "production" ? "[oculto]" : code;
    console.info(
      `[messaging:console] otp canal=${channel} para=${maskRecipient(recipient)} codigo=${shown}`,
    );
    return { providerMessageId: `console-${randomUUID()}` };
  },

  async sendTemplate({ channel, recipient, template }) {
    console.info(
      `[messaging:console] modelo=${template} canal=${channel} para=${maskRecipient(recipient)}`,
    );
    return { providerMessageId: `console-${randomUUID()}` };
  },
};
