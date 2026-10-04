/**
 * Descreve um erro inesperado para log, SEM nunca usar `error.message`: no Drizzle 0.45, uma
 * falha do driver vem embrulhada em `DrizzleQueryError`, cuja mensagem é
 * "Failed query: <sql>\nparams: <params>" e carregaria hashes de senha, ids e e-mails.
 * Loga só o nome do erro e, quando houver, o código da causa do driver (ex.: "23505").
 */
export function describeUnexpectedError(error: unknown): string {
  const name = error instanceof Error ? error.name : "erro desconhecido";
  const cause = error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  const code =
    cause && typeof cause === "object" && "code" in cause ? (cause as { code?: unknown }).code : undefined;
  return code ? `${name} (code=${String(code)})` : name;
}

/**
 * Violação de unicidade do Postgres. No Drizzle 0.45 o erro do driver pode vir embrulhado:
 * o código aparece em `error.code` ou em `error.cause.code`.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(cause && typeof cause === "object" && (cause as { code?: unknown }).code === "23505");
}
