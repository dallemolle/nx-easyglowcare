import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Nome do cookie de sessão (= `SESSION_COOKIE` em src/server/auth/session.ts). Duplicado de
// propósito: o guia do Next recomenda não depender de módulos compartilhados no proxy — ele
// roda isolado do resto da aplicação e pode ser implantado/otimizado separadamente.
const SESSION_COOKIE = "egc_session";
const LOGIN_PATH = "/admin/login";

/**
 * Atalho de UX para `/admin/*`: redireciona para o login quando não há cookie de sessão.
 * NÃO é a validação real (assinatura, revogação, expiração, troca de senha obrigatória) —
 * essa acontece em `requireStaff` (src/server/auth/current.ts), chamada pelo layout do
 * painel e por toda Server Action protegida.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
