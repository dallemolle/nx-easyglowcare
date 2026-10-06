import { z } from "zod";

/** Cookie com a origem do lead (primeiro toque), gravado pelo proxy com `path=/<slug>`. */
export const ORIGIN_COOKIE = "egc_origem";

/** Parâmetros de origem (UTMs e indicação) guardados quando o visitante chega à página da clínica. */
export const ORIGIN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
] as const;

type OriginParam = (typeof ORIGIN_PARAMS)[number];

// Caracteres de controle (C0 e DEL): é justamente o que se quer recusar.
const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Valor aceito como origem: sem caracteres de controle e com UTF-16 bem formado. O Postgres
 * recusa `\u0000` e surrogate solto em `jsonb` (`pending_signup`), o que quebraria o cadastro.
 */
function isCleanValue(value: string): boolean {
  return value.isWellFormed() && !CONTROL_CHAR.test(value);
}

const originValueSchema = z.string().refine(isCleanValue);

export const leadOriginParamsSchema = z.object(
  Object.fromEntries(ORIGIN_PARAMS.map((key) => [key, originValueSchema.optional()])) as Record<
    OriginParam,
    z.ZodOptional<typeof originValueSchema>
  >,
);

export type LeadOriginParams = Partial<Record<OriginParam, string>>;

export type LeadSource = "instagram" | "google" | "referral" | "direct" | "other";

const MAX_VALUE_LENGTH = 100;
// Mesmo padrão de `normalizeSlug` (src/server/services/tenants.ts), duplicado de propósito:
// o proxy não importa módulos de servidor.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 63;

/**
 * Decide se o proxy deve gravar o cookie de origem. Devolve o `path` (a clínica) e o valor JSON,
 * ou `null` quando não se aplica: fora de `/<slug>`, sem parâmetros de origem ou cookie já
 * existente (primeiro toque vence).
 */
export function originCookieFor(
  pathname: string,
  searchParams: URLSearchParams,
  hasCookie: boolean,
): { path: string; value: string } | null {
  if (hasCookie) return null;

  const slug = pathname.split("/")[1] ?? "";
  if (slug === "admin" || slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) return null;

  const params: LeadOriginParams = {};
  for (const key of ORIGIN_PARAMS) {
    // Corta por ponto de código (não por unidade UTF-16) para não partir um emoji ao meio.
    const value = Array.from((searchParams.get(key) ?? "").replace(CONTROL_CHARS, ""))
      .slice(0, MAX_VALUE_LENGTH)
      .join("");
    if (value && isCleanValue(value)) params[key] = value;
  }
  if (Object.keys(params).length === 0) return null;

  return { path: `/${slug}`, value: JSON.stringify(params) };
}

/**
 * Lê o cookie de origem. Não é assinado (vem do visitante): JSON inválido ou que não é objeto
 * vira `{}`, e cada chave inválida (não texto, caractere de controle, UTF-16 malformado) é
 * descartada sozinha, sem perder as outras.
 */
export function parseOriginCookie(value: string | undefined): LeadOriginParams {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const params: LeadOriginParams = {};
  for (const key of ORIGIN_PARAMS) {
    const result = originValueSchema.safeParse((parsed as Record<string, unknown>)[key]);
    if (result.success) params[key] = result.data;
  }
  return params;
}

/** Origem gravada em `people.source` (spec 4.3, na ordem). */
export function resolveLeadSource(params: LeadOriginParams): LeadSource {
  if (params.ref) return "referral";
  const source = params.utm_source?.toLowerCase();
  if (source && (source.includes("instagram") || source === "ig")) return "instagram";
  if (source?.includes("google")) return "google";
  if (ORIGIN_PARAMS.every((key) => !params[key])) return "direct";
  return "other";
}
