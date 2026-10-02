import "server-only";

import type { SignatureProvider } from "./types";

/**
 * Aceite eletrônico interno: a pessoa aceita o termo na própria tela, então o pedido já
 * nasce assinado. O registro do aceite (versão, data, IP) é responsabilidade de quem chama.
 */
export const internalSignatureProvider: SignatureProvider = {
  name: "internal",

  async requestSignature({ reference }) {
    return { providerSignatureId: `internal-${reference}`, status: "signed" };
  },

  async getStatus() {
    return "signed";
  },
};
