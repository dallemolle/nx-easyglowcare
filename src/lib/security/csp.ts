export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Deploy de Preview da Vercel (staging): libera a barra de comentários (vercel.live). */
  isPreview: boolean;
  /** Só quando a requisição chegou por HTTPS; em http://localhost quebraria os pedidos. */
  upgradeInsecureRequests: boolean;
};

const VERCEL_LIVE = "https://vercel.live";

/**
 * Política de segurança de conteúdo de cada página (spec do 0D, seção 5). Scripts só com o
 * nonce da requisição; estilos inline liberados porque o Next e os componentes Radix usam
 * `style="…"` (o risco de estilo injetado é baixo perto do de script).
 */
export function buildCsp({ nonce, isDev, isPreview, upgradeInsecureRequests }: CspOptions): string {
  const onPreview = (...sources: string[]) => (isPreview ? sources : []);
  const onDev = (...sources: string[]) => (isDev ? sources : []);

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...onDev("'unsafe-eval'"), ...onPreview(VERCEL_LIVE)]],
    ["style-src", ["'self'", "'unsafe-inline'", ...onPreview(VERCEL_LIVE)]],
    ["img-src", ["'self'", "data:", "blob:", ...onPreview(VERCEL_LIVE, "https://vercel.com")]],
    ["font-src", ["'self'", ...onPreview(VERCEL_LIVE, "https://assets.vercel.com")]],
    ["connect-src", ["'self'", ...onDev("ws:"), ...onPreview(VERCEL_LIVE, "wss://ws-us3.pusher.com")]],
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ...(isPreview ? ([["frame-src", [VERCEL_LIVE]]] as [string, string[]][]) : []),
  ];

  const parts = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (upgradeInsecureRequests) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}
