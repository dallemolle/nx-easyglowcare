import { describe, expect, it } from "vitest";

import { getSignatureProvider } from "./index";
import { internalSignatureProvider } from "./internal";

describe("getSignatureProvider", () => {
  it("devolve o interno por padrão; valor desconhecido cita a variável", () => {
    expect(getSignatureProvider()).toBe(internalSignatureProvider);
    expect(() => getSignatureProvider("zapsign")).toThrow(/SIGNATURE_PROVIDER/);
  });
});

describe("internalSignatureProvider", () => {
  it("o aceite eletrônico já nasce assinado", async () => {
    const request = await internalSignatureProvider.requestSignature({
      documentId: "termo-v1",
      signerName: "Marina Alves",
      reference: "aceite-1",
    });

    expect(request).toEqual({ providerSignatureId: "internal-aceite-1", status: "signed" });
    expect(await internalSignatureProvider.getStatus(request.providerSignatureId)).toBe("signed");
  });
});
