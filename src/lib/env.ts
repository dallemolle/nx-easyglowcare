import { z } from "zod";

// Variáveis vazias no .env (ex.: `SESSION_SECRET=`) contam como ausentes.
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const envSchema = z.object({
  DATABASE_URL: z.url(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  // Obrigatórias a partir dos subprojetos que as usam (0B/0C/0D).
  DATABASE_URL_UNPOOLED: optional,
  SESSION_SECRET: optional,
  DATA_ENCRYPTION_KEY: optional,
  CRON_SECRET: optional,
  BLOB_READ_WRITE_TOKEN: optional,
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  MESSAGING_PROVIDER: z.enum(["console"]).default("console"),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  SIGNATURE_PROVIDER: z.enum(["internal"]).default("internal"),
});

export type Env = z.infer<typeof envSchema>;

/** Lê e valida as variáveis de ambiente. A mensagem de erro cita nomes, nunca valores. */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Variáveis de ambiente inválidas: ${problems}`);
  }
  return result.data;
}
