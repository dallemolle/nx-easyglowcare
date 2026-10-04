import { handleCronRequest } from "@/server/jobs/cron-auth";
import { runOutboxJob } from "@/server/jobs/run";

export const maxDuration = 60;

// Chamado pelo cron da Vercel (vercel.json), que envia `Authorization: Bearer <CRON_SECRET>`.
export function GET(request: Request): Promise<Response> {
  return handleCronRequest(request, "outbox", runOutboxJob);
}
