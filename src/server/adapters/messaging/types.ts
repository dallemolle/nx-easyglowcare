import type { MessageChannel } from "@/lib/validation/outbox";

export type SendResult = { providerMessageId: string };

export type SendOtpInput = { channel: MessageChannel; recipient: string; code: string };

export type SendTemplateInput = {
  channel: MessageChannel;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
};

export interface MessagingProvider {
  readonly name: string;
  /** Código de verificação: chamado direto (fora da fila), porque quem faz login não pode esperar o cron. */
  sendOtp(input: SendOtpInput): Promise<SendResult>;
  /** Mensagem de modelo: só o processador da fila chama. */
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
}
