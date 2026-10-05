/** Cabeçalhos fixos de segurança, em toda resposta (inclusive /api). A CSP fica no proxy.ts. */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Para navegadores antigos que não entendem `frame-ancestors` da CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Sem `preload`: é difícil de desfazer e depende de domínio próprio.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];
