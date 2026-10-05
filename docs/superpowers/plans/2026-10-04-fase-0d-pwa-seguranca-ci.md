# Fase 0D: app instalável, segurança, CI e migrations automáticas (plano de implementação)

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** tornar o app instalável (clínica e painel), proteger todas as páginas com CSP por nonce e cabeçalhos de segurança, verificar cada PR no GitHub e aplicar as migrations sozinhas no deploy.

**Arquitetura:**
- **Funções puras:** a lógica fica em funções puras testadas com Vitest (`buildCsp`, `buildTenantManifest`, `detectInstallMode`, `shouldMigrate`).
- **Ligação com o Next:** fica em arquivos finos (`proxy.ts`, Route Handlers, páginas).
- **Service worker:** é um arquivo estático escrito à mão.
- **Comportamento de navegador:** CSP, instalação e modo offline são verificados com Playwright em 375px, em modo dev e em modo produção.

**Stack:** Next.js 16 (proxy, Route Handlers, `next/og`), Vitest, Playwright (Chrome instalado), GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-04-fase-0d-pwa-seguranca-ci-design.md`. Leia antes de começar; este plano não repete os motivos das decisões.

## Restrições globais

- Valem as restrições globais dos planos do 0A, 0B e 0C (`docs/superpowers/plans/`): pt-BR, commits em português no imperativo com `Co-Authored-By`, TDD, nunca logar segredo, URL de banco, e-mail, IP ou dado de cliente.
- **Branch:** `feat/fase-0d-pwa-seguranca-ci`. Não fazer push nem abrir PR: o dono do repositório faz isso à mão.
- **Next 16:** antes de escrever código do Next, leia o guia correspondente em `node_modules/next/dist/docs/` (regra do `AGENTS.md`): `02-guides/content-security-policy.md`, `02-guides/progressive-web-apps.md`, `03-api-reference/03-file-conventions/proxy.md`, `03-api-reference/04-functions/image-response.md`, `03-api-reference/04-functions/generate-metadata.md`.
- **Sem dependências novas.** Nada de biblioteca de PWA, `cross-env` ou similar.
- **D12 — instalar é sempre opcional:** nenhuma janela, banner ou aviso pedindo para instalar. O convite é só um link discreto "Instalar app". O texto "Você também pode continuar usando pelo navegador, sem instalar." aparece na tela de instalar sempre que o app ainda não estiver instalado.
- **Nada de dado de cliente no aparelho:** o service worker só guarda `/offline.html`.
- **CSP:** nonce por requisição; `style-src 'self' 'unsafe-inline'`; `'unsafe-eval'` e `ws:` só em desenvolvimento; `vercel.live` só em Preview.
- **Esclarecimento sobre a spec:** `upgrade-insecure-requests` só entra quando a requisição chegou por HTTPS. A spec diz "fora de desenvolvimento", mas o modo produção local (`next start` em `http://localhost`, usado pelo Playwright e pelo CI) quebraria se o navegador trocasse os pedidos para HTTPS. Na Vercel, toda requisição é HTTPS, então o efeito em produção é o mesmo.
- **Migrations no build:** só com `VERCEL_ENV=production`, ou com `VERCEL_ENV=preview` e `VERCEL_GIT_COMMIT_REF=staging`.
- **Banco:** comandos destrutivos e migrations só contra o Docker local. Antes de qualquer `pnpm db:migrate`/`db:seed`, confirme que `DATABASE_URL_UNPOOLED` não está definida no shell.
- **Servidor de dev ou de produção local:** para parar, mate só o PID que escuta a porta 3000. Nunca `taskkill /IM node.exe`.

## Foco de revisão

1. **Script legítimo bloqueado pela CSP:** qualquer bloqueio no console derruba os testes de navegador, em dev e em produção (Tarefas 2 e 4).
2. **Nonce previsível ou repetido:** dois pedidos seguidos têm nonces diferentes, gerados com `crypto.getRandomValues` (Tarefa 2).
3. **Rotas que não podem passar pelo proxy:** `/api/*`, arquivos do Next, ícones, manifests, `sw.js` e `offline.html` não recebem a CSP. O manifest do painel não pode ser redirecionado para o login (Tarefa 2).
4. **Dado guardado no aparelho:** o service worker não guarda nada além de `/offline.html` (Tarefa 4).
5. **Migration rodando onde não deve:** um branch de PR nunca migra o banco de staging; sem `DATABASE_URL_UNPOOLED`, o build de staging ou produção falha com mensagem clara (Tarefa 6).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/security/csp.ts` | `buildCsp` |
| `src/lib/security/headers.ts` | `SECURITY_HEADERS` (cabeçalhos fixos) |
| `next.config.ts` | Aplica os cabeçalhos fixos e o `Cache-Control` do `sw.js` |
| `src/proxy.ts` | Nonce + CSP em toda página; atalho de login do `/admin` |
| `src/app/layout.tsx` | Força renderização por requisição; registra o service worker; ícone do iPhone e cor do tema |
| `src/lib/pwa/constants.ts` | Cores e lista de ícones |
| `src/lib/pwa/manifest.ts` | `buildTenantManifest`, `buildPanelManifest` |
| `src/lib/pwa/icon.tsx` | `renderAppIcon` (`next/og`) |
| `src/app/icons/[name]/route.tsx` | Ícones PNG |
| `src/app/(public)/[slug]/manifest.webmanifest/route.ts` | Manifest da clínica |
| `src/app/(admin)/admin/manifest.webmanifest/route.ts` | Manifest do painel |
| `src/app/(public)/[slug]/layout.tsx` | Declara o manifest da clínica em todas as páginas `/<slug>/*` |
| `src/app/(admin)/admin/layout.tsx` | Declara o manifest do painel em todas as páginas `/admin/*` |
| `public/sw.js`, `public/offline.html` | Service worker e página "Sem conexão" |
| `src/components/pwa/service-worker-registrar.tsx` | Registra o service worker (só produção) e bloqueia o banner automático do navegador (D12) |
| `src/lib/pwa/install-mode.ts` | `detectInstallMode` |
| `src/components/pwa/install-guide.tsx` | Tela de instruções/botão "Instalar" |
| `src/app/(public)/[slug]/instalar/page.tsx`, `src/app/(admin)/admin/(painel)/instalar/page.tsx` | Telas "Instalar app" |
| `src/server/db/deploy-migration.ts`, `src/server/db/migrate-on-deploy.ts` | Decisão e script de migration no build |
| `vercel.json`, `package.json` | `buildCommand`, scripts `vercel-build` e `test:e2e:prod` |
| `playwright.config.ts`, `playwright.prod.config.ts` | Testes de navegador em dev e em produção |
| `e2e/fixtures.ts`, `e2e/security.spec.ts`, `e2e/pwa.spec.ts`, `e2e/offline.prod.spec.ts` | Testes de navegador novos |
| `.github/workflows/ci.yml` | CI |
| `README.md`, `ROADMAP.md` | Documentação |

---

### Task 1: política de segurança e cabeçalhos fixos

**Arquivos:**
- Criar: `src/lib/security/csp.ts`, `src/lib/security/headers.ts`
- Modificar: `next.config.ts`
- Testar: `src/lib/security/csp.test.ts`, `src/lib/security/headers.test.ts`

**Interfaces:**
- Produz:
  - `type CspOptions = { nonce: string; isDev: boolean; isPreview: boolean; upgradeInsecureRequests: boolean }`
  - `buildCsp(options: CspOptions): string` (diretivas separadas por `"; "`)
  - `SECURITY_HEADERS: { key: string; value: string }[]`

- [ ] **Passo 1: testes que falham**

`src/lib/security/csp.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { buildCsp, type CspOptions } from "./csp";

const PROD: CspOptions = { nonce: "abc123", isDev: false, isPreview: false, upgradeInsecureRequests: true };

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("buildCsp", () => {
  it("produção: só scripts do próprio site com o nonce", () => {
    const d = directives(buildCsp(PROD));

    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(d.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(d.get("img-src")).toBe("'self' data: blob:");
    expect(d.get("font-src")).toBe("'self'");
    expect(d.get("connect-src")).toBe("'self'");
    expect(d.get("manifest-src")).toBe("'self'");
    expect(d.get("worker-src")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.has("upgrade-insecure-requests")).toBe(true);
    expect(d.has("frame-src")).toBe(false);
  });

  it("nunca libera unsafe-inline para scripts nem unsafe-eval fora de desenvolvimento", () => {
    const csp = buildCsp(PROD);
    expect(directives(csp).get("script-src")).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("desenvolvimento: libera eval e websocket da atualização automática", () => {
    const d = directives(buildCsp({ ...PROD, isDev: true }));

    expect(d.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'");
    expect(d.get("connect-src")).toBe("'self' ws:");
  });

  it("upgrade-insecure-requests só quando pedido", () => {
    expect(directives(buildCsp({ ...PROD, upgradeInsecureRequests: false })).has("upgrade-insecure-requests")).toBe(false);
  });

  it("Preview: libera vercel.live para a barra de comentários; produção não", () => {
    const preview = directives(buildCsp({ ...PROD, isPreview: true }));

    expect(preview.get("script-src")).toContain("https://vercel.live");
    expect(preview.get("connect-src")).toContain("https://vercel.live");
    expect(preview.get("img-src")).toContain("https://vercel.live");
    expect(preview.get("frame-src")).toBe("https://vercel.live");
    expect(buildCsp(PROD)).not.toContain("vercel.live");
  });

  it("o nonce entra só em script-src", () => {
    const csp = buildCsp({ ...PROD, nonce: "NONCE-UNICO" });
    expect(csp.match(/NONCE-UNICO/g)).toHaveLength(1);
  });
});
```

`src/lib/security/headers.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

import { SECURITY_HEADERS } from "./headers";

describe("cabeçalhos de segurança fixos", () => {
  it("têm os valores da spec", () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    });
  });

  it("o next.config aplica os cabeçalhos a todas as rotas e o sw.js sai sem cache", async () => {
    const rules = await nextConfig.headers!();

    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(SECURITY_HEADERS);

    const sw = rules.find((rule) => rule.source === "/sw.js");
    expect(sw?.headers).toContainEqual({ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" });
  });
});
```

- [ ] **Passo 2:** `pnpm test src/lib/security` → falha (módulos não existem).

- [ ] **Passo 3: implementar**

`src/lib/security/csp.ts`:
```ts
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
```

`src/lib/security/headers.ts`:
```ts
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
```

`next.config.ts`:
```ts
import type { NextConfig } from "next";

import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Atualizações do service worker precisam chegar logo.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → limpo. Mutação: em `csp.ts`, troque `...onDev("'unsafe-eval'")` por `"'unsafe-eval'"` e veja o teste de produção falhar; desfaça à mão.
- [ ] **Passo 5: commit** "Adiciona política de segurança de conteúdo e cabeçalhos fixos".

---

### Task 2: CSP com nonce no proxy

**Arquivos:**
- Modificar: `src/proxy.ts`, `src/app/layout.tsx`, `e2e/admin-login.spec.ts` (só o import)
- Criar: `e2e/fixtures.ts`, `e2e/security.spec.ts`
- Testar: `src/proxy.test.ts`

**Interfaces:**
- Consome: `buildCsp` (Tarefa 1).
- Produz:
  - `proxy(request: NextRequest): NextResponse` e `config.matcher`;
  - `e2e/fixtures.ts`: `test` (com a verificação automática de bloqueios da CSP) e `expect`. **Todo spec novo importa `test`/`expect` de `./fixtures`, não de `@playwright/test`.**

- [ ] **Passo 1: testes que falham**

`src/proxy.test.ts`. O helper exportado nesta versão do Next é `unstable_doesMiddlewareMatch`; a documentação cita `unstable_doesProxyMatch`, que não existe no pacote instalado:
```ts
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

  it("em Preview libera vercel.live", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(proxy(new NextRequest("https://app.test/")).headers.get(CSP)).toContain("https://vercel.live");
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
```
Se o nome do cabeçalho repassado (`x-middleware-request-…`) for outro nesta versão do Next, imprima `Object.fromEntries(response.headers)` uma vez, ajuste a constante e explique no relatório. A asserção (a política repassada é a mesma da resposta) não muda.

`e2e/fixtures.ts`:
```ts
import { expect, test as base } from "@playwright/test";

/**
 * `test` com uma verificação automática: qualquer bloqueio da CSP registrado no console da
 * página derruba o teste. É assim que um script legítimo barrado pela política aparece antes
 * de chegar em produção.
 */
export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      await use(violations);
      expect(violations, "a CSP bloqueou algo nesta página").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
```

`e2e/admin-login.spec.ts`: trocar só a primeira linha por
```ts
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
```

`e2e/security.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("página da clínica sai com CSP por nonce e cabeçalhos de segurança", async ({ page }) => {
  const response = await page.goto("/easyglowcare");
  const headers = response!.headers();

  const csp = headers["content-security-policy"];
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).toContain("frame-ancestors 'none'");

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  // Os scripts do Next recebem o nonce desta resposta.
  const scriptNonces = await page.locator("script[src]").evaluateAll((scripts) =>
    scripts.map((script) => (script as HTMLScriptElement).nonce),
  );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(new Set(scriptNonces)).toEqual(new Set([nonce]));
});

test("rotas /api não recebem CSP, mas recebem os cabeçalhos fixos", async ({ request }) => {
  const response = await request.get("/api/cron/outbox");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-security-policy"]).toBeUndefined();
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
```

- [ ] **Passo 2:** `pnpm test src/proxy.test.ts` → falha.

- [ ] **Passo 3: implementar**

`src/proxy.ts` (substitui o arquivo inteiro):
```ts
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
    isPreview: process.env.VERCEL_ENV === "preview",
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
      source:
        "/((?!api/|_next/static|_next/image|favicon.ico|icons/|sw.js|offline.html|[^/]+/manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

`src/app/layout.tsx`:
- importar `import { headers } from "next/headers";`;
- trocar a assinatura por `export default async function RootLayout({ children }: LayoutProps<"/">) {`;
- primeira linha do corpo:
```ts
  // Lê a requisição para que nenhuma página seja gerada no build: o nonce da CSP (proxy.ts)
  // só existe por requisição, e uma página pré-gerada sairia com scripts sem nonce.
  await headers();
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → limpo. No resumo do build, nenhuma rota de página aparece como estática (○).
- [ ] **Passo 5:** `pnpm test:e2e` (Docker de pé) → todos passam, inclusive os de `security.spec.ts`, sem bloqueio de CSP. Se o `next dev` precisar de algo além de `'unsafe-eval'` e `ws:`, **não** afrouxe a política de produção: libere só no ramo `isDev` de `buildCsp`, com teste, e registre no relatório.
- [ ] **Passo 6: mutações** (desfaça à mão):
  - troque `generateNonce()` por `"fixo"` → o teste "nonce diferente" falha;
  - tire `sw.js|` do matcher → o teste "não roda em /sw.js" falha.
- [ ] **Passo 7: commit** "Aplica CSP com nonce em todas as páginas".

---

### Task 3: ícones e manifests

**Arquivos:**
- Criar: `src/lib/pwa/constants.ts`, `src/lib/pwa/manifest.ts`, `src/lib/pwa/icon.tsx`, `src/app/icons/[name]/route.tsx`, `src/app/(public)/[slug]/manifest.webmanifest/route.ts`, `src/app/(admin)/admin/manifest.webmanifest/route.ts`, `src/app/(public)/[slug]/layout.tsx`, `src/app/(admin)/admin/layout.tsx`, `e2e/pwa.spec.ts`
- Modificar: `src/app/layout.tsx` (metadados de ícone e cor do tema)
- Testar: `src/lib/pwa/manifest.test.ts`, `src/app/icons/[name]/route.test.ts`, `src/app/(public)/[slug]/manifest.webmanifest/route.test.ts`

**Interfaces:**
- Produz:
  - `PWA_THEME_COLOR`, `PWA_BACKGROUND_COLOR`, `APP_ICONS`, `APPLE_TOUCH_ICON` em `constants.ts`
  - `buildTenantManifest(tenant: { slug: string; name: string }): MetadataRoute.Manifest`
  - `buildPanelManifest(): MetadataRoute.Manifest`
  - `renderAppIcon(size: number, maskable: boolean): ImageResponse`
  - `GET /icons/{icon-192.png|icon-512.png|maskable-512.png|apple-touch-icon.png}`
  - `GET /<slug>/manifest.webmanifest` e `GET /admin/manifest.webmanifest`

- [ ] **Passo 1: testes que falham**

`src/lib/pwa/manifest.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { APP_ICONS, PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "./constants";
import { buildPanelManifest, buildTenantManifest } from "./manifest";

describe("buildTenantManifest", () => {
  it("usa o nome da clínica e abre na página dela", () => {
    expect(buildTenantManifest({ slug: "easyglowcare", name: "EasyGlowCare" })).toEqual({
      id: "/easyglowcare",
      name: "EasyGlowCare",
      short_name: "EasyGlowCare",
      start_url: "/easyglowcare",
      scope: "/easyglowcare",
      display: "standalone",
      lang: "pt-BR",
      background_color: PWA_BACKGROUND_COLOR,
      theme_color: PWA_THEME_COLOR,
      icons: [...APP_ICONS],
    });
  });

  it("cada clínica tem seu próprio app", () => {
    expect(buildTenantManifest({ slug: "outra", name: "Outra" }).id).toBe("/outra");
  });
});

describe("buildPanelManifest", () => {
  it("é o app do painel, separado das clínicas", () => {
    expect(buildPanelManifest()).toMatchObject({
      id: "/admin",
      name: "EasyGlowCare Painel",
      short_name: "Painel",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      lang: "pt-BR",
    });
  });
});

describe("APP_ICONS", () => {
  it("tem 192, 512 e 512 maskable", () => {
    expect(APP_ICONS.map((icon) => [icon.src, icon.sizes, icon.purpose])).toEqual([
      ["/icons/icon-192.png", "192x192", "any"],
      ["/icons/icon-512.png", "512x512", "any"],
      ["/icons/maskable-512.png", "512x512", "maskable"],
    ]);
  });
});
```

`src/app/icons/[name]/route.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { GET } from "./route";

const call = (name: string) => GET(new Request(`http://localhost/icons/${name}`), { params: Promise.resolve({ name }) });

describe("GET /icons/[name]", () => {
  it.each([
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ])("%s é um PNG", async (name) => {
    const response = await call(name);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });

  it("nome desconhecido dá 404", async () => {
    expect((await call("icone-qualquer.png")).status).toBe(404);
  });
});
```
Se o `ImageResponse` não renderizar dentro do Vitest (ambiente `node`), mantenha o teste de 404, troque os casos de PNG por um teste de navegador em `e2e/pwa.spec.ts` (`request.get("/icons/icon-192.png")` → 200 e `image/png`) e registre isso no relatório.

`src/app/(public)/[slug]/manifest.webmanifest/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getTenantBySlug: vi.fn() }));
vi.mock("@/server/services/tenants", () => ({ getTenantBySlug: mocks.getTenantBySlug }));

import { GET } from "./route";

const TENANT_ID = "3f2b8c1e-5d4a-4b7e-9a1c-2d6e8f0a1b3c";
const call = (slug: string) =>
  GET(new Request(`http://localhost/${slug}/manifest.webmanifest`), { params: Promise.resolve({ slug }) });

beforeEach(() => {
  mocks.getTenantBySlug.mockReset();
});

describe("GET /[slug]/manifest.webmanifest", () => {
  it("devolve o manifest da clínica, sem dados internos", async () => {
    mocks.getTenantBySlug.mockResolvedValue({
      tenant: { id: TENANT_ID, slug: "easyglowcare", name: "EasyGlowCare", config: { segredo: 1 } },
      scope: {},
    });

    const response = await call("easyglowcare");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ name: "EasyGlowCare", start_url: "/easyglowcare" });
    expect(body).not.toContain(TENANT_ID);
    expect(body).not.toContain("segredo");
  });

  it("clínica inexistente dá 404", async () => {
    mocks.getTenantBySlug.mockResolvedValue(null);
    expect((await call("nao-existe")).status).toBe(404);
  });
});
```

- [ ] **Passo 2:** `pnpm test src/lib/pwa src/app` → falha.

- [ ] **Passo 3: implementar**

`src/lib/pwa/constants.ts`:
```ts
// Cores e ícone provisórios, iguais para todas as clínicas: logo e cor por clínica entram com o
// upload de imagens (Etapa 2).
export const PWA_THEME_COLOR = "#18181b";
export const PWA_BACKGROUND_COLOR = "#ffffff";

export const APP_ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon.png";
```

`src/lib/pwa/manifest.ts`:
```ts
import type { MetadataRoute } from "next";

import { APP_ICONS, PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "./constants";

type Manifest = MetadataRoute.Manifest;

function appManifest(fields: { scope: string; name: string; shortName: string }): Manifest {
  return {
    id: fields.scope,
    name: fields.name,
    short_name: fields.shortName,
    start_url: fields.scope,
    scope: fields.scope,
    display: "standalone",
    lang: "pt-BR",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [...APP_ICONS],
  };
}

/** App de uma clínica: tem o nome dela e abre em /<slug>. Só o nome e o slug saem daqui. */
export function buildTenantManifest(tenant: { slug: string; name: string }): Manifest {
  return appManifest({ scope: `/${tenant.slug}`, name: tenant.name, shortName: tenant.name });
}

/** App do painel da equipe, separado do app das clientes. */
export function buildPanelManifest(): Manifest {
  return appManifest({ scope: "/admin", name: "EasyGlowCare Painel", shortName: "Painel" });
}
```

`src/lib/pwa/icon.tsx`:
```tsx
import { ImageResponse } from "next/og";

import { PWA_THEME_COLOR } from "./constants";

/**
 * Ícone provisório: "EG" sobre a cor do tema. O `maskable` ocupa o quadrado todo e deixa as
 * letras dentro da área segura (o sistema recorta em círculo ou gota).
 */
export function renderAppIcon(size: number, maskable: boolean): ImageResponse {
  const fontSize = Math.round(size * (maskable ? 0.3 : 0.4));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PWA_THEME_COLOR,
          color: "#fafafa",
          fontSize,
          fontWeight: 700,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        EG
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
```

`src/app/icons/[name]/route.tsx`:
```tsx
import { renderAppIcon } from "@/lib/pwa/icon";

// "icons" vira um caminho reservado: uma clínica com slug "icons" perderia /icons/<arquivo>.
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  // O iPhone não usa transparência: fundo cheio, como o maskable.
  "apple-touch-icon.png": { size: 180, maskable: true },
};

export async function GET(_request: Request, { params }: RouteContext<"/icons/[name]">) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });
  return renderAppIcon(icon.size, icon.maskable);
}
```

`src/app/(public)/[slug]/manifest.webmanifest/route.ts`:
```ts
import { buildTenantManifest } from "@/lib/pwa/manifest";
import { getTenantBySlug } from "@/server/services/tenants";

const MANIFEST_HEADERS = {
  "Content-Type": "application/manifest+json; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

export async function GET(_request: Request, { params }: RouteContext<"/[slug]/manifest.webmanifest">) {
  const found = await getTenantBySlug((await params).slug);
  if (!found) return new Response("Not found", { status: 404 });
  return Response.json(buildTenantManifest(found.tenant), { headers: MANIFEST_HEADERS });
}
```
O `buildTenantManifest` recebe a clínica inteira, mas só lê `slug` e `name`; o teste garante que nada além disso sai.

`src/app/(admin)/admin/manifest.webmanifest/route.ts`:
```ts
import { buildPanelManifest } from "@/lib/pwa/manifest";

// Fora do proxy (ver src/proxy.ts): o navegador busca o manifest sem cookie de sessão.
export function GET() {
  return Response.json(buildPanelManifest(), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
```

`src/app/(public)/[slug]/layout.tsx`:
```tsx
import type { Metadata } from "next";

import { getTenantBySlug } from "@/server/services/tenants";

/** Todas as páginas de /<slug> apontam para o app da clínica. */
export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const found = await getTenantBySlug((await params).slug);
  return found ? { manifest: `/${found.tenant.slug}/manifest.webmanifest` } : {};
}

export default function TenantLayout({ children }: LayoutProps<"/[slug]">) {
  return children;
}
```

`src/app/(admin)/admin/layout.tsx`:
```tsx
import type { Metadata } from "next";

/** Todas as páginas de /admin (login, troca de senha, painel) apontam para o app do painel. */
export const metadata: Metadata = { manifest: "/admin/manifest.webmanifest" };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
```

`src/app/layout.tsx`:
- importar `import { APPLE_TOUCH_ICON, PWA_THEME_COLOR } from "@/lib/pwa/constants";`;
- em `metadata`, acrescentar `icons: { apple: APPLE_TOUCH_ICON },`;
- em `viewport`, acrescentar `themeColor: PWA_THEME_COLOR,`.

`e2e/pwa.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("a página da clínica aponta para o app da clínica", async ({ page, request }) => {
  await page.goto("/easyglowcare");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/easyglowcare/manifest.webmanifest");

  const manifest = await (await request.get("/easyglowcare/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "EasyGlowCare", start_url: "/easyglowcare", scope: "/easyglowcare" });
});

test("o login do painel aponta para o app do painel, que abre sem sessão", async ({ page, request }) => {
  await page.goto("/admin/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/admin/manifest.webmanifest");

  const response = await request.get("/admin/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ name: "EasyGlowCare Painel", start_url: "/admin" });
});

test("manifest de clínica inexistente dá 404", async ({ request }) => {
  expect((await request.get("/nao-existe/manifest.webmanifest")).status()).toBe(404);
});
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → limpo; `pnpm test:e2e` → passa.
- [ ] **Passo 5: commit** "Adiciona manifests do app da clínica e do painel, com ícones".

---

### Task 4: service worker e página "Sem conexão"

**Arquivos:**
- Criar: `public/sw.js`, `public/offline.html`, `src/components/pwa/service-worker-registrar.tsx`, `playwright.prod.config.ts`, `e2e/offline.prod.spec.ts`
- Modificar: `src/app/layout.tsx`, `playwright.config.ts`, `package.json`

**Interfaces:**
- Produz: `ServiceWorkerRegistrar` (componente sem saída visual), o script `pnpm test:e2e:prod` e a convenção "specs `*.prod.spec.ts` só rodam em modo produção".

- [ ] **Passo 1: o modo produção do Playwright**

`playwright.config.ts`: acrescentar `testIgnore: "**/*.prod.spec.ts",` logo abaixo de `testDir: "e2e",`.

`playwright.prod.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

import base from "./playwright.config";

// Mesmos testes, contra o app em modo produção (`next start`, depois de `next build`): sem o
// 'unsafe-eval' da CSP de dev e com o service worker ativo. Roda também os `*.prod.spec.ts`.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

`package.json`, em `scripts`, depois de `test:e2e`:
```json
"test:e2e:prod": "next build && playwright test --config playwright.prod.config.ts",
```

- [ ] **Passo 2: o teste que falha**

`e2e/offline.prod.spec.ts`:
```ts
import { expect, test } from "./fixtures";

test("sem internet, a navegação mostra a página Sem conexão", async ({ page, context }) => {
  await page.goto("/easyglowcare");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Depois de ativado, o service worker assume a página na próxima navegação.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  // LGPD: nada além da página "Sem conexão" fica no aparelho.
  expect(cached).toEqual(["/offline.html"]);

  await context.setOffline(true);
  await page.goto("/easyglowcare/instalar");
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("link", { name: "Tentar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Sem conexão" })).toBeHidden();
});
```
A rota `/easyglowcare/instalar` só passa a existir na Tarefa 5. Neste teste, ela só é visitada sem internet, quando a resposta vem do service worker, então funciona antes disso.

- [ ] **Passo 3:** `pnpm test:e2e:prod` (com o Docker de pé e nada na porta 3000) → o teste novo falha (sem service worker); os demais passam em modo produção.

- [ ] **Passo 4: implementar**

`public/sw.js`:
```js
// Service worker do EasyGlowCare (spec do 0D, seção 4). Só guarda a página "Sem conexão":
// nenhum dado de cliente fica no aparelho (LGPD). Mude a versão para trocar o cache.
const CACHE_NAME = "egc-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

// Só navegações (páginas): tenta a rede e, sem rede, mostra a página "Sem conexão".
// Nenhuma outra requisição é interceptada nem guardada.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
```

`public/offline.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sem conexão</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #ffffff;
        color: #18181b;
      }
      main {
        max-width: 22rem;
        padding: 1.5rem;
        text-align: center;
      }
      h1 {
        font-size: 1.5rem;
        margin: 0 0 0.5rem;
      }
      p {
        color: #52525b;
        margin: 0 0 1.5rem;
      }
      a {
        display: inline-block;
        padding: 0.75rem 1.25rem;
        border-radius: 0.5rem;
        background: #18181b;
        color: #fafafa;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Sem conexão</h1>
      <p>Parece que você está sem internet. Confira a conexão e tente de novo.</p>
      <!-- href vazio: abre de novo o endereço em que a pessoa estava (sem script). -->
      <a href="">Tentar de novo</a>
    </main>
  </body>
</html>
```

`src/components/pwa/service-worker-registrar.tsx`:
```tsx
"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (só em produção: no `next dev` ele atrapalharia a atualização
 * automática) e impede o banner automático "instalar app" do navegador. Pela decisão D12, o
 * convite para instalar é só o link discreto da página; a tela /instalar continua oferecendo
 * o botão.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    const blockAutomaticBanner = (event: Event) => event.preventDefault();
    window.addEventListener("beforeinstallprompt", blockAutomaticBanner);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Sem service worker o app funciona igual; só perde a página "Sem conexão".
      });
    }

    return () => window.removeEventListener("beforeinstallprompt", blockAutomaticBanner);
  }, []);

  return null;
}
```

`src/app/layout.tsx`: importar `import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";` e renderizar `<ServiceWorkerRegistrar />` logo antes de `<Toaster />`.

- [ ] **Passo 5:** `pnpm test:e2e:prod` → passa, inclusive o teste offline, sem bloqueio de CSP; `pnpm test:e2e` (dev) → passa e pula o `*.prod.spec.ts`. Depois `pnpm test && pnpm typecheck && pnpm lint`.
- [ ] **Passo 6: mutação** (desfaça à mão): em `sw.js`, troque `if (event.request.mode !== "navigate") return;` por nada e adicione `cache.put` da resposta → o teste de "nada além da página Sem conexão" deve falhar. Se a mutação for trabalhosa demais, troque o `OFFLINE_URL` do `cache.add` por `"/"` e confirme que o teste falha.
- [ ] **Passo 7: commit** "Adiciona service worker com página Sem conexão".

---

### Task 5: telas "Instalar app"

**Arquivos:**
- Criar: `src/lib/pwa/install-mode.ts`, `src/components/pwa/install-guide.tsx`, `src/app/(public)/[slug]/instalar/page.tsx`, `src/app/(admin)/admin/(painel)/instalar/page.tsx`
- Modificar: `src/app/(public)/[slug]/page.tsx` (link), `src/app/(admin)/admin/(painel)/page.tsx` (link), `e2e/pwa.spec.ts`
- Testar: `src/lib/pwa/install-mode.test.ts`

**Interfaces:**
- Produz:
  - `type InstallMode = "installed" | "prompt" | "ios" | "other"`
  - `detectInstallMode(input: { standalone: boolean; canPrompt: boolean; userAgent: string; maxTouchPoints: number }): InstallMode`
  - `<InstallGuide appName={string} />`

- [ ] **Passo 1: testes que falham**

`src/lib/pwa/install-mode.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { detectInstallMode } from "./install-mode";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const base = { standalone: false, canPrompt: false, userAgent: ANDROID, maxTouchPoints: 5 };

describe("detectInstallMode", () => {
  it("já instalado vence tudo", () => {
    expect(detectInstallMode({ ...base, standalone: true, canPrompt: true, userAgent: IPHONE })).toBe("installed");
  });

  it("navegador ofereceu a instalação → botão", () => {
    expect(detectInstallMode({ ...base, canPrompt: true })).toBe("prompt");
  });

  it("iPhone → passo a passo do Safari", () => {
    expect(detectInstallMode({ ...base, userAgent: IPHONE })).toBe("ios");
  });

  it("iPad em modo computador (Macintosh com toque) → passo a passo do Safari", () => {
    expect(detectInstallMode({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe("ios");
  });

  it("Mac de verdade (sem toque) → instrução genérica", () => {
    expect(detectInstallMode({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).toBe("other");
  });

  it("Android sem oferta do navegador → instrução genérica", () => {
    expect(detectInstallMode(base)).toBe("other");
  });
});
```

E acrescentar a `e2e/pwa.spec.ts`:
```ts
test.describe("tela de instalar da clínica", () => {
  test("a página da clínica tem o link discreto e a tela explica como instalar", async ({ page }) => {
    await page.goto("/easyglowcare");
    await page.getByRole("link", { name: "Instalar app" }).click();

    await expect(page).toHaveURL(/\/easyglowcare\/instalar$/);
    await expect(page.getByRole("heading", { name: "Instalar o app" })).toBeVisible();
    await expect(page.getByText("Você também pode continuar usando pelo navegador, sem instalar.")).toBeVisible();
    // D12: nada de janela pedindo para instalar.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clínica inexistente dá 404", async ({ page }) => {
    const response = await page.goto("/nao-existe/instalar");
    expect(response?.status()).toBe(404);
  });
});

test.describe("tela de instalar no iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("mostra o passo a passo do Safari", async ({ page }) => {
    await page.goto("/easyglowcare/instalar");
    await expect(page.getByText("Adicionar à Tela de Início")).toBeVisible();
  });
});
```

E o teste do painel. Ele reaproveita a senha do e2e e o dono do seed:
```ts
import { E2E_STAFF_PASSWORD } from "./constants";

test("o painel tem a tela de instalar", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill("dono@easyglowcare.test");
  await page.getByLabel("Senha").fill(E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: "Instalar o painel no celular" }).click();
  await expect(page).toHaveURL(/\/admin\/instalar$/);
  await expect(page.getByRole("heading", { name: "Instalar o painel" })).toBeVisible();
});
```
(o `import` vai para o topo do arquivo, junto do import de `./fixtures`).

- [ ] **Passo 2:** `pnpm test src/lib/pwa/install-mode.test.ts` → falha.

- [ ] **Passo 3: implementar**

`src/lib/pwa/install-mode.ts`:
```ts
export type InstallMode = "installed" | "prompt" | "ios" | "other";

/**
 * O que a tela "Instalar app" mostra. iPad em modo computador se apresenta como "Macintosh";
 * a diferença para um Mac de verdade é a tela de toque.
 */
export function detectInstallMode(input: {
  standalone: boolean;
  canPrompt: boolean;
  userAgent: string;
  maxTouchPoints: number;
}): InstallMode {
  if (input.standalone) return "installed";
  if (input.canPrompt) return "prompt";
  const isIos = /iPhone|iPad|iPod/i.test(input.userAgent);
  const isIpadDesktopMode = /Macintosh/.test(input.userAgent) && input.maxTouchPoints > 1;
  if (isIos || isIpadDesktopMode) return "ios";
  return "other";
}
```

`src/components/pwa/install-guide.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { detectInstallMode, type InstallMode } from "@/lib/pwa/install-mode";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function currentMode(canPrompt: boolean): InstallMode {
  return detectInstallMode({
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    canPrompt,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  });
}

/** Instruções de instalação. Instalar é opcional (D12): o texto sempre lembra disso. */
export function InstallGuide({ appName }: { appName: string }) {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setMode(currentMode(false));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setMode(currentMode(true));
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setMode("installed");
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // O convite do navegador só pode ser usado uma vez.
    setPromptEvent(null);
    setMode(outcome === "accepted" ? "installed" : currentMode(false));
  }

  if (mode === null) return null;

  if (mode === "installed") {
    return <p>O app {appName} já está instalado neste aparelho.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {mode === "prompt" && (
        <Button className="self-start" onClick={install}>
          Instalar
        </Button>
      )}

      {mode === "ios" && (
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Abra esta página no Safari.</li>
          <li>Toque em Compartilhar (o quadrado com uma seta para cima).</li>
          <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo; e toque em &ldquo;Adicionar&rdquo;.</li>
        </ol>
      )}

      {mode === "other" && (
        <p>
          Abra o menu do navegador (os três pontinhos) e escolha &ldquo;Instalar app&rdquo; ou
          &ldquo;Adicionar à tela inicial&rdquo;.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Você também pode continuar usando pelo navegador, sem instalar.
      </p>
    </div>
  );
}
```

`src/app/(public)/[slug]/instalar/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InstallGuide } from "@/components/pwa/install-guide";
import { getTenantBySlug } from "@/server/services/tenants";

export const metadata: Metadata = { title: "Instalar app" };

export default async function InstalarPage({ params }: PageProps<"/[slug]/instalar">) {
  const found = await getTenantBySlug((await params).slug);
  if (!found) notFound();
  const { tenant } = found;

  return (
    <main className="mx-auto flex w-full max-w-screen-sm flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Instalar o app</h1>
      <p className="text-muted-foreground">
        Coloque {tenant.name} na tela inicial do celular para abrir com um toque.
      </p>
      <InstallGuide appName={tenant.name} />
      <Link href={`/${tenant.slug}`} className="self-start text-sm underline underline-offset-4">
        Voltar
      </Link>
    </main>
  );
}
```

`src/app/(admin)/admin/(painel)/instalar/page.tsx`:
```tsx
import type { Metadata } from "next";
import Link from "next/link";

import { InstallGuide } from "@/components/pwa/install-guide";
import { requireStaff } from "@/server/auth/current";

export const metadata: Metadata = { title: "Instalar o painel" };

export default async function InstalarPainelPage() {
  await requireStaff();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Instalar o painel</h1>
      <p className="text-muted-foreground">
        Coloque o painel na tela inicial do celular para abrir a agenda com um toque.
      </p>
      <InstallGuide appName="EasyGlowCare Painel" />
      <Link href="/admin" className="self-start text-sm underline underline-offset-4">
        Voltar
      </Link>
    </div>
  );
}
```

`src/app/(public)/[slug]/page.tsx`:
- importar `import Link from "next/link";`;
- no fim do `<header>`, depois do bloco do endereço:
```tsx
        <Link
          href={`/${tenant.slug}/instalar`}
          className="self-start text-sm text-muted-foreground underline underline-offset-4"
        >
          Instalar app
        </Link>
```

`src/app/(admin)/admin/(painel)/page.tsx`: depois do link "Equipe", fora do condicional de permissão:
```tsx
      <Link href="/admin/instalar" className="text-sm underline underline-offset-4">
        Instalar o painel no celular
      </Link>
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint`, depois `pnpm test:e2e` e `pnpm test:e2e:prod` → passam, sem bloqueio de CSP.
- [ ] **Passo 5:** abra `/easyglowcare/instalar` e `/admin/instalar` num Chrome a 375px (o Playwright já faz; confira também um screenshot) e veja se a tela está legível e alinhada.
- [ ] **Passo 6: commit** "Adiciona telas Instalar app da clínica e do painel".

---

### Task 6: migrations automáticas no deploy

**Arquivos:**
- Criar: `src/server/db/deploy-migration.ts`, `src/server/db/migrate-on-deploy.ts`
- Modificar: `vercel.json`, `package.json`
- Testar: `src/server/db/deploy-migration.test.ts`

**Interfaces:**
- Produz:
  - `type MigrationDecision = { migrate: boolean; reason: string }`
  - `shouldMigrate(env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }): MigrationDecision`
  - o script `pnpm vercel-build`

- [ ] **Passo 1: teste que falha**

`src/server/db/deploy-migration.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { shouldMigrate } from "./deploy-migration";

describe("shouldMigrate", () => {
  it.each([
    [{ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" }, true],
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging" }, true],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/fase-0d-pwa-seguranca-ci" }, false],
    [{ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "staging-2" }, false],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL_ENV: "development" }, false],
    [{}, false],
  ])("%j → migra: %s", (env, expected) => {
    expect(shouldMigrate(env).migrate).toBe(expected);
  });

  it("explica por que pulou num branch de PR", () => {
    expect(shouldMigrate({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" }).reason).toContain("feat/x");
  });
});
```

- [ ] **Passo 2:** `pnpm test src/server/db/deploy-migration.test.ts` → falha.

- [ ] **Passo 3: implementar**

`src/server/db/deploy-migration.ts`:
```ts
export type MigrationDecision = { migrate: boolean; reason: string };

/**
 * Se o build da Vercel deve aplicar as migrations (spec do 0D, seção 7): só produção e o
 * Preview do branch `staging`. Um branch de PR nunca altera o banco de staging; build local e
 * CI nunca tocam no Neon.
 */
export function shouldMigrate(env: { VERCEL_ENV?: string; VERCEL_GIT_COMMIT_REF?: string }): MigrationDecision {
  if (env.VERCEL_ENV === "production") return { migrate: true, reason: "deploy de produção" };
  if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "staging") {
    return { migrate: true, reason: "deploy de staging" };
  }
  if (env.VERCEL_ENV === "preview") {
    return {
      migrate: false,
      reason: `preview do branch ${env.VERCEL_GIT_COMMIT_REF ?? "desconhecido"}: migrations só rodam em staging e produção`,
    };
  }
  return { migrate: false, reason: "fora da Vercel (build local ou CI)" };
}
```

`src/server/db/migrate-on-deploy.ts`:
```ts
/**
 * Roda no build da Vercel antes do `next build` (script `vercel-build`): aplica as migrations
 * no banco do ambiente. Se falhar, o build falha e a versão anterior continua no ar.
 * Toda migration precisa funcionar com a versão anterior do app ainda rodando (ver README).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { describeUnexpectedError } from "../errors";

import { describeDatabaseTarget } from "./database-target";
import { shouldMigrate } from "./deploy-migration";

class MissingDatabaseUrlError extends Error {}

async function main() {
  const decision = shouldMigrate(process.env);
  if (!decision.migrate) {
    console.log(`[migrate] pulado: ${decision.reason}`);
    return;
  }

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new MissingDatabaseUrlError(
      "Defina DATABASE_URL_UNPOOLED neste ambiente da Vercel para aplicar as migrations no deploy.",
    );
  }

  console.log(`[migrate] ${decision.reason} · banco: ${describeDatabaseTarget(url)}`);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
    console.log("[migrate] migrations aplicadas");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Só a nossa mensagem de configuração é mostrada por inteiro; erro de banco vai sem a
  // mensagem (pode carregar SQL e parâmetros).
  const detail = error instanceof MissingDatabaseUrlError ? error.message : describeUnexpectedError(error);
  console.error(`[migrate] falhou: ${detail}`);
  process.exit(1);
});
```

`package.json`, em `scripts`, depois de `build`:
```json
"vercel-build": "tsx src/server/db/migrate-on-deploy.ts && next build",
```

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["gru1"],
  "buildCommand": "pnpm vercel-build",
  "crons": [
    { "path": "/api/cron/outbox", "schedule": "0 9 * * *" },
    { "path": "/api/cron/cleanup", "schedule": "30 9 * * *" }
  ]
}
```
(mantenha os `crons` exatamente como estão hoje no arquivo).

- [ ] **Passo 4: conferir o script contra o Docker local**, simulando os três casos. Confira antes que `DATABASE_URL_UNPOOLED` não está no shell; o valor abaixo é o do Docker:
```bash
VERCEL_ENV=preview VERCEL_GIT_COMMIT_REF=feat/x pnpm exec tsx src/server/db/migrate-on-deploy.ts
VERCEL_ENV=production pnpm exec tsx src/server/db/migrate-on-deploy.ts; echo "saída: $?"
VERCEL_ENV=production DATABASE_URL_UNPOOLED=postgres://postgres:postgres@localhost:5432/easyglowcare pnpm exec tsx src/server/db/migrate-on-deploy.ts
```
Esperado:
- o primeiro imprime `pulado: preview do branch feat/x…`;
- o segundo falha com `Defina DATABASE_URL_UNPOOLED…` e saída 1;
- o terceiro imprime `deploy de produção · banco: localhost` e `migrations aplicadas` (nada novo a aplicar).
- [ ] **Passo 5:** `pnpm test && pnpm typecheck && pnpm lint` → limpo.
- [ ] **Passo 6: commit** "Aplica migrations automaticamente no deploy de staging e produção".

---

### Task 7: CI no GitHub

**Arquivos:**
- Criar: `.github/workflows/ci.yml`

**Interfaces:**
- Consome: os scripts `lint`, `typecheck`, `test`, `db:migrate`, `test:e2e:prod`, e a exigência do `e2e/global-setup.ts` de um `.env.local` com bancos locais.

- [ ] **Passo 1: escrever o workflow**

`.github/workflows/ci.yml`:
```yaml
# Verificação de cada PR para staging/main (spec do 0D, seção 6). Usa só valores de teste:
# nenhum segredo real e nenhum acesso ao Neon.
name: CI

on:
  pull_request:
    branches: [staging, main]
  push:
    branches: [staging, main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verificar:
    name: Lint, tipos, testes, build e navegador
    runs-on: ubuntu-latest
    timeout-minutes: 30

    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: easyglowcare
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d easyglowcare"
          --health-interval 2s
          --health-timeout 3s
          --health-retries 30
      neon-proxy:
        image: ghcr.io/timowilhelm/local-neon-http-proxy:main
        env:
          PG_CONNECTION_STRING: postgres://postgres:postgres@postgres:5432/easyglowcare
        ports:
          - 4444:4444

    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Criar o banco de teste
        run: psql postgres://postgres:postgres@localhost:5432/easyglowcare -c "CREATE DATABASE easyglowcare_test"

      - name: Criar o .env.local de CI (só valores de teste)
        run: |
          cat > .env.local <<'EOF'
          DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/easyglowcare
          DATABASE_URL_UNPOOLED=postgres://postgres:postgres@localhost:5432/easyglowcare
          TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/easyglowcare_test
          NEXT_PUBLIC_APP_URL=http://localhost:3000
          SESSION_SECRET=ci-session-secret-0123456789abcdefghij
          CRON_SECRET=ci-cron-secret-0123456789
          MESSAGING_PROVIDER=console
          PAYMENT_PROVIDER=mock
          SIGNATURE_PROVIDER=internal
          EOF

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm db:migrate

      # Faz o next build e roda o Playwright contra o app em modo produção (Chrome já
      # instalado na máquina do GitHub).
      - run: pnpm test:e2e:prod
```

- [ ] **Passo 2: conferir o YAML** sem rede: `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"`, depois uma revisão linha a linha.
  - O `pnpm/action-setup@v4` lê a versão do `packageManager`.
  - O serviço `neon-proxy` alcança o Postgres pelo nome `postgres`.
  - O `db.localtest.me` resolve para `127.0.0.1` na máquina do GitHub, onde estão as portas 5432 e 4444.
  - Se houver algum pacote com YAML no `node_modules` (por exemplo `yaml`), use-o para validar a sintaxe e diga no relatório qual usou.
- [ ] **Passo 3: simular localmente o que o CI faz** (Docker de pé, porta 3000 livre): `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e:prod`.
- [ ] **Passo 4: commit** "Adiciona CI no GitHub com testes de navegador em modo produção".

---

### Task 8: documentação e verificação final

**Arquivos:**
- Modificar: `README.md`, `ROADMAP.md`

- [ ] **Passo 1: `README.md`** (leitor: o dono do app, em português e PowerShell; mantenha o tom e o formato atuais)
- Em "Testes e checagens": acrescentar `pnpm test:e2e:prod  # build + Playwright em modo produção (igual ao CI)`.
- **Nova seção "Instalar o app"**, depois de "Equipe e login":
  - a cliente instala pelo link "Instalar app" da página da clínica (`/<slug>/instalar`), e a equipe pelo "Instalar o painel no celular" (`/admin/instalar`);
  - no Android, pelo botão "Instalar"; no iPhone, pelo Safari: Compartilhar > Adicionar à Tela de Início;
  - instalar é opcional: tudo funciona pelo link no navegador;
  - sem internet, o app mostra uma página "Sem conexão" e não guarda dado nenhum no aparelho;
  - o service worker só roda em modo produção (`pnpm build && pnpm start`), não no `pnpm dev`.
- **Nova seção "CI"**:
  - o que roda em cada PR para `staging`/`main`;
  - que não usa segredo nenhum;
  - como exigir o CI antes do merge no GitHub: Settings > Branches > Add branch ruleset (ou "Add rule") para `staging` e `main`, marcar "Require status checks to pass" e escolher "Lint, tipos, testes, build e navegador".
- **Em "Neon + Vercel"**:
  - trocar o passo do `pnpm db:migrate` manual por: "As migrations rodam sozinhas no build da Vercel, em produção (`main`) e no staging; outros branches não alteram nenhum banco. Confira que `DATABASE_URL_UNPOOLED` existe em Production (banco de produção) e em Preview (banco de staging). Se uma migration falhar, o deploy falha e a versão anterior continua no ar.";
  - manter o comando manual só como alternativa de emergência;
  - acrescentar a regra: "Toda migration precisa funcionar com a versão anterior do app ainda no ar: acrescentar tabela, coluna opcional ou índice pode; apagar ou renomear se faz em duas etapas, em dois deploys."
- **Na seção "Fila de mensagens, auditoria e limpeza"**, onde fala de chamar as rotas em staging: acrescentar que o staging tem a proteção de deploys da Vercel ligada e que a chamada à mão precisa também do cabeçalho `x-vercel-protection-bypass` com a chave criada em Settings > Deployment Protection > Protection Bypass for Automation, mostrando o exemplo:
```powershell
Invoke-RestMethod "https://SEU-ENDERECO-git-staging.vercel.app/api/cron/outbox" -Headers @{ Authorization = "Bearer $env:CRON_SECRET"; 'x-vercel-protection-bypass' = $env:VERCEL_BYPASS }
```

- [ ] **Passo 2: `ROADMAP.md`**
- Fase 0:
  - `- [x] \`audit_log\`, seed da "EasyGlowCare", CI (lint, typecheck, testes)`;
  - `- [x] PWA: manifest, ícones, service worker, tela "instalar app"`.
- Tabela "Recomendados (qualidade e segurança)":
  - na linha "Headers de segurança e CSP", trocar a coluna "Quando" por `Feito no 0D` e as notas por `CSP com nonce por requisição (proxy.ts) e cabeçalhos fixos (next.config)`;
  - acrescentar `| Migrations automáticas | Feito no 0D: aplicadas no build da Vercel em staging e produção | Feito | Toda migration precisa ser compatível com a versão anterior no ar |`;
  - acrescentar `| Caminhos reservados | Impedir clínicas com slug igual a rotas do app (admin, api, icons, minha-conta…) | Antes de clínicas reais | Hoje um slug "icons" perderia /icons/<arquivo> |`.
- Etapa 2 (Catálogo): acrescentar uma linha à tabela: `| Logo e cor da clínica no app instalado (manifest e ícones) | [VN] |`.

- [ ] **Passo 3: verificação completa** (Docker de pé, porta 3000 livre):
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e && pnpm test:e2e:prod
```
Tudo limpo, sem bloqueio de CSP.

- [ ] **Passo 4: conferência visual a 375px**: com `pnpm build && pnpm start`, abra num Chrome com 375px de largura (ou screenshots do Playwright) `/easyglowcare`, `/easyglowcare/instalar`, `/admin/login` e `/admin/instalar` (logado), e a página "Sem conexão" (desligando a rede nas ferramentas do Chrome). Pare o servidor pelo PID da porta 3000.
- [ ] **Passo 5: commit** "Atualiza documentação da Fase 0D".

---

## Fica com o dono do repositório

1. Antes do merge: conferir na Vercel que `DATABASE_URL_UNPOOLED` existe em **Production** (banco de produção) e em **Preview** (banco de staging).
2. No primeiro PR, conferir na aba "Checks" do GitHub que o CI passou.
3. Depois do merge, opcional e recomendado: exigir o CI antes do merge em `staging` e `main` (passo a passo no README).
4. Testar a instalação no celular: Android pelo botão "Instalar"; iPhone pelo Safari.
