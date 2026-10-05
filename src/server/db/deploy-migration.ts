export type MigrationDecision = { migrate: boolean; reason: string };

/**
 * Se o build da Vercel deve aplicar as migrations (spec do 0D, seção 7): só produção e o
 * Preview do branch `staging`. Um branch de PR nunca altera o banco de staging; build local e
 * CI nunca tocam no Neon.
 */
export function shouldMigrate(env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }): MigrationDecision {
  if (env.VERCEL_ENV === "production") return { migrate: true, reason: "deploy de produção" };
  if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "staging") {
    return { migrate: true, reason: "deploy de staging" };
  }
  if (env.VERCEL_ENV === "preview") {
    return {
      migrate: false,
      reason: `preview do branch ${env.VERCEL_GIT_COMMIT_REF ?? "desconhecido"}: migrations só rodam em staging e produção`,
    };
  }
  return { migrate: false, reason: "fora da Vercel (build local ou CI)" };
}
