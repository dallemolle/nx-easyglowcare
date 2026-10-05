/**
 * Destino seguro após a entrada: só caminhos da própria clínica (`/<slug>` ou `/<slug>/...`).
 * Qualquer outro valor (nulo, outro site, outra clínica, `..`, barras duplas, contrabarra) ou a
 * própria tela de entrada (para não criar laço) cai em `/<slug>/minha-conta`.
 */
export function safeReturnPath(slug: string, voltar: string | null | undefined): string {
  const fallback = `/${slug}/minha-conta`;
  if (!voltar) return fallback;
  if (voltar.includes("\\") || voltar.includes("..") || voltar.includes("//")) return fallback;
  if (voltar !== `/${slug}` && !voltar.startsWith(`/${slug}/`)) return fallback;

  const rest = voltar.slice(`/${slug}`.length).split(/[?#]/)[0];
  if (rest === "/entrar" || rest.startsWith("/entrar/")) return fallback;
  return voltar;
}
