import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";
import { describeUnexpectedError } from "@/server/errors";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Confere `Authorization: Bearer <CRON_SECRET>` (é o que o cron da Vercel envia). Sem segredo
 * configurado, recusa tudo. Compara os hashes em tempo constante: o tempo de resposta não
 * revela quantos caracteres do segredo estavam certos.
 */
export function isAuthorizedCron(
  request: Request,
  secret: string | undefined = getEnv().CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}

/**
 * Corpo comum das rotas de cron: sem autorização responde 401 e o job não roda; erro
 * inesperado vira 500 sem detalhe (no log, só nome e código do erro).
 */
export async function handleCronRequest(
  request: Request,
  label: string,
  job: () => Promise<unknown>,
): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await job());
  } catch (error) {
    console.error(`[cron:${label}] erro inesperado:`, describeUnexpectedError(error));
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
