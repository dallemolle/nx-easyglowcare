import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "./proxy";

const CSP = "content-security-policy";
const FORWARDED_CSP = "x-middleware-request-content-security-policy";

function nonceOf(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("matcher do proxy", () => {
  it.each(["/", "/easyglowcare", "/easyglowcare/instalar", "/admin", "/admin/login", "/minha-conta"])(
    "roda em %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    },
  );

  it.each([
    "/api/cron/outbox",
    "/_next/static/chunks/main.js",
    "/_next/image?url=x",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/sw.js",
    "/offline.html",
    "/easyglowcare/manifest.webmanifest",
    "/admin/manifest.webmanifest",
  ])("não roda em %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it("não roda em prefetch do next/link", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/easyglowcare", headers: { "next-router-prefetch": "1" } }),
    ).toBe(false);
  });

  it("roda em pré-carregamento de documento do navegador", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/easyglowcare", headers: { purpose: "prefetch" } }),
    ).toBe(true);
  });

  it.each(["/sw-js", "/swxjs/instalar", "/offline-html"])("roda em slugs parecidos com arquivos excluídos: %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});

describe("proxy", () => {
  it("põe a mesma CSP com nonce na resposta e na requisição repassada ao Next", () => {
    const response = proxy(new NextRequest("https://app.test/easyglowcare"));

    const csp = response.headers.get(CSP);
    expect(nonceOf(csp)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(response.headers.get(FORWARDED_CSP)).toBe(csp);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("gera um nonce diferente a cada requisição", () => {
    const nonces = new Set(
      Array.from({ length: 20 }, () => nonceOf(proxy(new NextRequest("https://app.test/")).headers.get(CSP))),
    );
    expect(nonces.size).toBe(20);
  });

  it("em http (produção local) não pede upgrade para https", () => {
    const csp = proxy(new NextRequest("http://localhost:3000/easyglowcare")).headers.get(CSP);
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("em Preview a política é a mesma de produção", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const csp = proxy(new NextRequest("https://app.test/")).headers.get(CSP);
    expect(csp).not.toContain("vercel.live");
    expect(csp).toContain("script-src 'self' 'nonce-");
  });

  it("/admin sem cookie redireciona para o login", () => {
    const response = proxy(new NextRequest("https://app.test/admin/equipe"));
    expect(getRedirectUrl(response)).toBe("https://app.test/admin/login");
  });

  it("/administracao não é tratado como painel", () => {
    const response = proxy(new NextRequest("https://app.test/administracao"));
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get(CSP)).toContain("'nonce-");
  });

  it("/admin/login sem cookie recebe a CSP e não é redirecionado", () => {
    const response = proxy(new NextRequest("https://app.test/admin/login"));
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get(CSP)).toContain("'nonce-");
  });

  it("/admin com cookie segue com a CSP", () => {
    const request = new NextRequest("https://app.test/admin", { headers: { cookie: "egc_session=x" } });
    const response = proxy(request);
    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get(CSP)).toContain("'nonce-");
  });
});
