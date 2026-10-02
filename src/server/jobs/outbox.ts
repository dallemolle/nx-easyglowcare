import "server-only";

import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import type { MessagingProvider } from "@/server/adapters/messaging/types";
import { messageOutbox, type MessageOutbox } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";

// Este job processa a fila de TODAS as clínicas de uma vez: por isso recebe o `db` e não um
// TenantScope. Só é chamado pelo cron (src/server/jobs/run.ts), nunca por uma request de usuário.

export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 5 * 60 * 1000;
/** Espera depois da 1ª, 2ª, 3ª e 4ª falha; a 5ª vira `failed`. */
export const OUTBOX_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export type OutboxRunResult = { claimed: number; sent: number; retried: number; failed: number };

/**
 * Reserva um lote: seleciona as mensagens vencidas (ou com reserva expirada) com
 * FOR UPDATE SKIP LOCKED e, na mesma transação, marca como `sending` com prazo. Duas execuções
 * simultâneas nunca reservam a mesma linha, e uma execução que morre libera a mensagem quando
 * o prazo (`locked_until`) passar.
 */
async function claimBatch(db: AnyPgDatabase, now: Date): Promise<MessageOutbox[]> {
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: messageOutbox.id })
      .from(messageOutbox)
      .where(
        or(
          and(eq(messageOutbox.status, "pending"), lte(messageOutbox.sendAt, now)),
          and(eq(messageOutbox.status, "sending"), lt(messageOutbox.lockedUntil, now)),
        ),
      )
      .orderBy(asc(messageOutbox.sendAt))
      .limit(OUTBOX_BATCH_SIZE)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    return tx
      .update(messageOutbox)
      .set({
        status: "sending",
        lockedUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
        attempts: sql`${messageOutbox.attempts} + 1`,
      })
      .where(
        inArray(
          messageOutbox.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });

  // UPDATE ... RETURNING não garante ordem.
  return claimed.toSorted(
    (a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * A conclusão só vale se a reserva ainda é desta execução (status `sending` e mesma tentativa).
 * Se a execução demorou além do prazo e outra retomou a linha, a escrita tardia não pode
 * sobrescrever o resultado da outra; a linha perdida simplesmente não entra nas contagens.
 */
function ownLease(message: MessageOutbox) {
  return and(
    eq(messageOutbox.id, message.id),
    eq(messageOutbox.status, "sending"),
    eq(messageOutbox.attempts, message.attempts),
  );
}

/**
 * Envia as mensagens vencidas da fila. Entrega "ao menos uma vez": se o provedor aceitar e a
 * gravação do sucesso falhar, a mensagem volta a ser enviada quando a reserva expirar.
 */
export async function processOutbox(
  db: AnyPgDatabase,
  provider: Pick<MessagingProvider, "sendTemplate">,
  now: Date = new Date(),
): Promise<OutboxRunResult> {
  const batch = await claimBatch(db, now);
  const result: OutboxRunResult = { claimed: batch.length, sent: 0, retried: 0, failed: 0 };

  for (const message of batch) {
    let providerMessageId: string;
    try {
      // O envio fica fora de qualquer transação: não segura conexão nem lock durante a rede.
      ({ providerMessageId } = await provider.sendTemplate({
        channel: message.channel,
        recipient: message.recipient,
        template: message.template,
        payload: message.payload,
      }));
    } catch (error) {
      // Nunca `error.message`: a mensagem do provedor pode trazer o destinatário.
      const lastError = describeUnexpectedError(error);
      const exhausted = message.attempts >= OUTBOX_MAX_ATTEMPTS;
      const updated = await db
        .update(messageOutbox)
        .set(
          exhausted
            ? { status: "failed", lockedUntil: null, lastError }
            : {
                status: "pending",
                lockedUntil: null,
                lastError,
                sendAt: new Date(now.getTime() + OUTBOX_RETRY_DELAYS_MS[message.attempts - 1]),
              },
        )
        .where(ownLease(message))
        .returning({ id: messageOutbox.id });
      if (updated.length === 0) continue;
      if (exhausted) result.failed += 1;
      else result.retried += 1;
      continue;
    }

    const updated = await db
      .update(messageOutbox)
      .set({ status: "sent", sentAt: now, providerMessageId, lockedUntil: null, lastError: null })
      .where(ownLease(message))
      .returning({ id: messageOutbox.id });
    if (updated.length > 0) result.sent += 1;
  }

  console.info(
    `[outbox] claimed=${result.claimed} sent=${result.sent} retried=${result.retried} failed=${result.failed}`,
  );
  return result;
}
