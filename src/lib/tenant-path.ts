/**
 * Endereço canônico de uma página de clínica. `getTenantBySlug` aceita `/EasyGlowCare`, mas os
 * cookies da clínica usam `path=/<slug normalizado>`, e o navegador compara o path diferenciando
 * maiúsculas: em `/EasyGlowCare/...` eles nunca chegam. Devolve o caminho com o slug canônico
 * (mesmo resto e mesma query) para redirecionar, ou `null` quando o slug já é o canônico.
 */
export function canonicalTenantPath(
  rawSlug: string,
  tenantSlug: string,
  rest: string,
  search: Record<string, string | string[] | undefined>,
): string | null {
  if (rawSlug === tenantSlug) return null;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    for (const item of value === undefined ? [] : Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  const queryString = query.toString();
  return `/${tenantSlug}${rest}${queryString ? `?${queryString}` : ""}`;
}
