import "server-only";

import { getEnv } from "@/lib/env";

import { consoleMessagingProvider } from "./console";
import type { MessagingProvider } from "./types";

export type { MessagingProvider, SendOtpInput, SendResult, SendTemplateInput } from "./types";

export function getMessagingProvider(name: string = getEnv().MESSAGING_PROVIDER): MessagingProvider {
  switch (name) {
    case "console":
      return consoleMessagingProvider;
    default:
      throw new Error(`MESSAGING_PROVIDER desconhecido: ${name}`);
  }
}
