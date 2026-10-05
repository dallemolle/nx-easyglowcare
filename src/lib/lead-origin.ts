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

export const leadOriginParamsSchema = z.object(
  Object.fromEntries(ORIGIN_PARAMS.map((key) => [key, z.string().optional()])) as Record<
    OriginParam,
    z.ZodOptional<z.ZodString>
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
    const value = searchParams.get(key);
    if (value) params[key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  if (Object.keys(params).length === 0) return null;

  return { path: `/${slug}`, value: JSON.stringify(params) };
}

/** Lê o cookie de origem. Não é assinado (vem do visitante): qualquer coisa inválida vira `{}`. */
export function parseOriginCookie(value: string | undefined): LeadOriginParams {
  if (!value) return {};
  try {
    const parsed = leadOriginParamsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
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
