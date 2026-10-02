import "server-only";

import { eq } from "drizzle-orm";

import { enqueueMessageSchema, type EnqueueMessageInput } from "@/lib/validation/outbox";
import { messageOutbox, type MessageOutbox } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";
import { isUniqueViolation } from "@/server/errors";

export class OutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxError";
  }
}

/**
 * Enfileira uma mensagem para o cron enviar (nada é enviado na hora). Com `dedupeKey`
 * repetida na mesma clínica, não cria segunda linha: devolve a que já existe.
 */
export async function enqueueMessage(
  scope: TenantScope,
  input: EnqueueMessageInput,
  now: Date = new Date(),
): Promise<MessageOutbox> {
  const parsed = enqueueMessageSchema.safeParse(input);
  if (!parsed.success) {
    // Só o nome dos campos: a mensagem do Zod pode ecoar o valor (o destinatário).
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new OutboxError(`Mensagem inválida: ${fields}`);
  }
  const { channel, template, recipient, payload, sendAt, dedupeKey } = parsed.data;

  try {
    const [message] = await scope.insert(messageOutbox, {
      channel,
      template,
      recipient,
      payload,
      sendAt: sendAt ?? now,
      dedupeKey,
    });
    return message;
  } catch (error) {
    if (!dedupeKey || !isUniqueViolation(error)) throw error;
    const [existing] = await scope.select(messageOutbox, eq(messageOutbox.dedupeKey, dedupeKey));
    if (!existing) throw error;
    return existing;
  }
}
