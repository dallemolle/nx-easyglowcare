import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCsp } from "@/lib/security/csp";

// Nome do cookie de sessão (= `SESSION_COOKIE` em src/server/auth/session.ts). Duplicado de
// propósito: o proxy não importa módulos de servidor (banco, sessão).
const SESSION_COOKIE = "egc_session";
const LOGIN_PATH = "/admin/login";

function isPanelPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** 16 bytes aleatórios em base64: imprevisível e diferente a cada requisição. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Roda em toda página (ver `config.matcher`):
 * 1. Atalho de UX para `/admin/*`: sem cookie de sessão, vai para o login. NÃO é a validação
 *    real (assinatura, revogação, expiração), que acontece em `requireStaff`
 *    (src/server/auth/current.ts).
 * 2. CSP com nonce: a política vai na requisição repassada (o Next lê dali o nonce e o aplica
 *    nos scripts dele) e na resposta (o navegador aplica).
 */
export function proxy(request: NextRequest) {
  const { pathname, protocol } = request.nextUrl;

  if (isPanelPath(pathname) && pathname !== LOGIN_PATH && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  const csp = buildCsp({
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: protocol === "https:",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Fora: /api (sem HTML), arquivos do Next, ícones, service worker, página "Sem conexão"
      // e manifests (o navegador busca o manifest sem cookie; o do painel não pode ir para o login).
      // Arquivos exatos são ancorados com `$` e têm o ponto escapado, para não pegar slugs como
      // `/sw-js`. Fora também o prefetch de dados do next/link (`next-router-prefetch`, nunca um
      // documento). `Purpose: prefetch` NÃO entra: o navegador o manda ao pré-carregar documentos
      // (prerender), e esse documento precisa da CSP porque será usado na navegação real.
      source:
        "/((?!api/|_next/static|_next/image|icons/|sw\\.js$|offline\\.html$|favicon\\.ico$|[^/]+/manifest\\.webmanifest$).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
