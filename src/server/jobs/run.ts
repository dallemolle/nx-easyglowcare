import "server-only";

import { getMessagingProvider } from "@/server/adapters/messaging";
import { db } from "@/server/db/client";

import { cleanupOldData, type CleanupResult } from "./cleanup";
import { processOutbox, type OutboxRunResult } from "./outbox";

// Único módulo de jobs autorizado a importar @/server/db/client: os crons processam todas as
// clínicas de uma vez e por isso não passam pelo tenantScope. Só as rotas /api/cron/* chamam
// estas funções, depois de `isAuthorizedCron`.

export function runOutboxJob(): Promise<OutboxRunResult> {
  return processOutbox(db, getMessagingProvider());
}

export function runCleanupJob(): Promise<CleanupResult> {
  return cleanupOldData(db);
}
