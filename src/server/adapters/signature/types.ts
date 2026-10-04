export type SignatureStatus = "pending" | "signed" | "declined";

export type RequestSignatureInput = {
  documentId: string;
  signerName: string;
  /** Identificador do aceite no nosso sistema. */
  reference: string;
};

export type SignatureRequest = { providerSignatureId: string; status: SignatureStatus };

export interface SignatureProvider {
  readonly name: string;
  requestSignature(input: RequestSignatureInput): Promise<SignatureRequest>;
  getStatus(providerSignatureId: string): Promise<SignatureStatus>;
}
