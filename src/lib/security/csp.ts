export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Só quando a requisição chegou por HTTPS; em http://localhost quebraria os pedidos. */
  upgradeInsecureRequests: boolean;
};

/**
 * Política de segurança de conteúdo de cada página (spec do 0D, seção 5). Scripts só com o
 * nonce da requisição; estilos inline liberados porque o Next e os componentes Radix usam
 * `style="…"` (o risco de estilo injetado é baixo perto do de script).
 *
 * A mesma política vale em produção e em Preview. Com `'strict-dynamic'` o navegador ignora
 * fontes de host em `script-src`, então liberar `vercel.live` não faria a barra de comentários
 * da Vercel carregar: ela não aparece nos Previews com esta CSP.
 */
export function buildCsp({ nonce, isDev, upgradeInsecureRequests }: CspOptions): string {
  const onDev = (...sources: string[]) => (isDev ? sources : []);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...onDev("'unsafe-eval'")]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'"]],
    ["connect-src", ["'self'", ...onDev("ws:")]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];

  const parts = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (upgradeInsecureRequests) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
