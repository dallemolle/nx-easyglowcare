import "server-only";

import { getEnv } from "@/lib/env";

import { internalSignatureProvider } from "./internal";
import type { SignatureProvider } from "./types";

export * from "./types";

export function getSignatureProvider(name: string = getEnv().SIGNATURE_PROVIDER): SignatureProvider {
  switch (name) {
    case "internal":
      return internalSignatureProvider;
    default:
      throw new Error(`SIGNATURE_PROVIDER desconhecido: ${name}`);
  }
}
