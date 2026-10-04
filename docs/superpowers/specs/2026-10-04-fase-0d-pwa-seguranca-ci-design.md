# Fase 0D: app instalável, cabeçalhos de segurança, CI e migrations automáticas (design)

- **Data:** 04/10/2026
- **Status:** aguardando revisão
- **Referências:** `CLAUDE.md` (seções 3, 4 e 7), `ROADMAP.md` (Fase 0), specs do 0A, 0B e 0C; guias do Next 16 em `node_modules/next/dist/docs/01-app/02-guides/` (`progressive-web-apps.md` e `content-security-policy.md`)

## 1. Contexto e objetivo

Com o 0C, a Fase 0 tem base multi-tenant, login da equipe, fila de mensagens e auditoria. O 0D fecha a Fase 0 com quatro entregas:
- o app instalável (PWA) para clientes e equipe;
- os cabeçalhos de segurança e a CSP (política de segurança de conteúdo) exigidos pelo `CLAUDE.md`;
- a verificação automática no GitHub (CI);
- as migrations aplicadas sozinhas no deploy.

O 0D está pronto quando:
- a cliente instala o app da clínica pelo celular, e o ícone abre a página da clínica;
- a equipe instala o painel;
- sem internet, o app mostra uma página "Sem conexão";
- toda página sai com CSP por nonce, e nenhum fluxo existente registra bloqueio da política;
- cada PR para `staging` ou `main` roda lint, typecheck, Vitest, build e Playwright no GitHub;
- o deploy de `staging` e de `main` aplica as migrations antes de colocar a versão nova no ar, sem o `pnpm db:migrate` manual.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Um app por clínica**: o app instalado tem o nome da clínica e abre em `/<slug>` | Combina com o futuro SaaS; cada negócio parece ter o próprio app |
| D2 | **App separado para o painel** ("EasyGlowCare Painel", abre em `/admin`) | A equipe instala o painel sem misturar com o app das clientes |
| D3 | **Sem internet, só uma página "Sem conexão"**; nada mais fica guardado no aparelho | LGPD: agenda, cadastro e dados de saúde nunca ficam em cache. Também evita mostrar horário já ocupado |
| D4 | **Ícone provisório igual para todas as clínicas**, gerado pelo Next (sem arquivos de imagem no repositório) | O logo de cada clínica depende do upload de imagens (Etapa 2) |
| D5 | **Notificações push ficam para a Etapa 4**, com as chaves VAPID | Só ali existe algo para notificar |
| D6 | **CSP com nonce por requisição**, gerado no `proxy.ts` | É a forma recomendada pelo Next 16; a política fixa precisaria liberar scripts inline |
| D7 | **Estilos inline liberados** (`style-src 'self' 'unsafe-inline'`) | O Next e os componentes Radix usam `style="…"`. O risco de estilo injetado é baixo perto do de script, que segue protegido por nonce |
| D8 | **Todas as páginas geradas na hora** | O nonce só existe com renderização dinâmica. Hoje quase todas as páginas já são assim |
| D9 | **Migrations no build da Vercel, só em Production e no Preview do branch `staging`** | Rodam antes de a versão nova entrar no ar; migration com erro derruba o build e a versão anterior continua. Nenhuma senha de banco vai para o GitHub. Branches de PR nunca alteram o banco de staging |
| D10 | **CI com Playwright contra o app em modo produção** | Pega erros que só aparecem no fluxo real e ativa o teste do service worker |
| D11 | **Tudo funciona no plano Hobby da Vercel**; o CI roda no GitHub Actions | Sem custo novo |

## 3. Escopo

**Dentro:**
- manifest por clínica e manifest do painel;
- ícones;
- service worker com página "Sem conexão";
- telas "Instalar app" e os links para elas;
- CSP com nonce e cabeçalhos fixos de segurança;
- workflow de CI;
- migrations automáticas no build;
- documentação.

**Fora:**
- notificações push e chaves VAPID (Etapa 4);
- logo e cor por clínica (Etapa 2);
- cache de páginas para uso offline;
- domínio próprio e `preload` do HSTS;
- RLS e as demais pendências do ROADMAP.

## 4. App instalável (PWA)

### Manifests

| App | Endereço | Conteúdo |
|---|---|---|
| Clínica | `/<slug>/manifest.webmanifest` (Route Handler, lê a clínica no banco) | `name` e `short_name`: nome da clínica; `id`, `start_url` e `scope`: `/<slug>`; `display: standalone`; `lang: pt-BR`; cores do tema provisórias; ícones da seção abaixo. Slug inexistente → 404 |
| Painel | `/admin/manifest.webmanifest` | `name`: "EasyGlowCare Painel"; `short_name`: "Painel"; `id`, `start_url` e `scope`: `/admin`; demais campos iguais |

- A página pública `/<slug>` declara o manifest da clínica pelos metadados do Next.
- O layout do painel e as telas de login e de troca de senha declaram o manifest do painel.
- O navegador busca o manifest sem cookie. Por isso o `proxy.ts` deixa `/admin/manifest.webmanifest` passar sem sessão; ele não contém dado nenhum.

### Ícones

- Gerados pelo Next (`ImageResponse`), sem arquivos de imagem no repositório: as iniciais "EG" sobre uma cor de fundo provisória.
- Tamanhos: 192 e 512 (`purpose: any`), 512 `maskable` (com margem de segurança) e 180 para o iPhone (`apple-touch-icon`).
- Os mesmos ícones servem aos dois apps até o logo por clínica (Etapa 2).

### Service worker e página "Sem conexão"

- Arquivo `public/sw.js`, escrito à mão, sem biblioteca, com escopo `/`. Registrado por um componente cliente no layout raiz, **só quando `NODE_ENV === "production"`**.
- **Instalação:** guarda em cache só `/offline.html`.
- **Requisições de navegação (páginas):** tenta a rede; se a rede falhar, devolve `/offline.html`.
- **Demais requisições:** não intercepta.
- **Ativação:** apaga caches de versões anteriores. O nome do cache tem um número de versão.
- **`/offline.html`:** HTML estático em `public/`, com estilo próprio e sem script. Mostra "Sem conexão", um texto curto e um link "Tentar de novo" que recarrega a página.
- O `sw.js` é servido com `Cache-Control: no-cache`, para as atualizações chegarem logo.

### Telas "Instalar app"

| Tela | Acesso |
|---|---|
| `/<slug>/instalar` | Link "Instalar app" na página da clínica |
| `/admin/instalar` | Link no painel; exige sessão como o resto do painel |

Um componente cliente comum às duas telas decide o que mostrar:

| Situação | O que aparece |
|---|---|
| App já aberto como instalado (`display-mode: standalone`) | "O app já está instalado" |
| O navegador ofereceu a instalação (`beforeinstallprompt`) | Botão "Instalar" |
| iPhone/iPad (Safari) | Passo a passo: "Compartilhar > Adicionar à Tela de Início" |
| Outros casos | Instrução genérica para usar o menu do navegador |

A tela é mobile-first, em pt-BR, e funciona em 375px.

## 5. Segurança: CSP e cabeçalhos

### CSP com nonce

- O `proxy.ts` passa a rodar em todas as rotas, exceto:
  - `/_next/static` e `/_next/image`;
  - ícones e favicon;
  - `sw.js` e `offline.html`;
  - os manifests;
  - `/api` (não renderiza HTML).
- **A cada requisição, o proxy:**
  - gera um nonce aleatório (16 bytes em base64);
  - monta a política com `buildCsp`;
  - coloca a política no cabeçalho da **requisição**, para o Next aplicar o nonce nos scripts dele;
  - coloca a política também no cabeçalho da **resposta**.
- O redirecionamento de `/admin/*` sem cookie para o login continua igual e continua não sendo a validação real da sessão.
- Para nenhuma página ser gerada no build, o layout raiz lê os cabeçalhos da requisição.

### `buildCsp({ nonce, isDev, isPreview })`

Função pura em `src/lib/security/csp.ts`, que monta a política com estas diretivas:

| Diretiva | Valor |
|---|---|
| `default-src` | `'self'` |
| `script-src` | `'self' 'nonce-<nonce>' 'strict-dynamic'`; mais `'unsafe-eval'` só em desenvolvimento |
| `style-src` | `'self' 'unsafe-inline'` |
| `img-src` | `'self' data: blob:` |
| `font-src` | `'self'` |
| `connect-src` | `'self'`; em desenvolvimento também `ws:` (atualização automática do `next dev`) |
| `manifest-src` | `'self'` |
| `worker-src` | `'self'` |
| `frame-ancestors` | `'none'` |
| `object-src` | `'none'` |
| `base-uri` | `'self'` |
| `form-action` | `'self'` |
| `upgrade-insecure-requests` | Só fora de desenvolvimento |

- **Só em Preview** (`VERCEL_ENV === "preview"`): `https://vercel.live` entra em `script-src`, `connect-src`, `img-src` e `frame-src`, para a barra de comentários da Vercel continuar funcionando em staging.
- O Vercel Blob entra em `img-src` na Etapa 2.

### Cabeçalhos fixos (`next.config.ts`)

Aplicados a todas as respostas, inclusive `/api`:

| Cabeçalho | Valor |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (sem `preload`) |

## 6. CI no GitHub (`.github/workflows/ci.yml`)

- **Gatilhos:**
  - `pull_request` para `staging` e `main`;
  - `push` em `staging` e `main`.
  - Um push novo no mesmo PR cancela a execução anterior.
- **Permissões:** `contents: read`.
- **Serviços:**
  - `postgres:17`;
  - o proxy local do Neon (`ghcr.io/timowilhelm/local-neon-http-proxy:main`), apontando para o serviço Postgres.
  - Um passo cria os bancos `easyglowcare` e `easyglowcare_test`.
- **Ambiente:** só valores de teste (`DATABASE_URL`, `DATABASE_URL_UNPOOLED` e `TEST_DATABASE_URL` locais; `SESSION_SECRET` e `CRON_SECRET` fictícios). Nenhum segredo real; o CI nunca acessa o Neon.
- **Passos:**
  1. checkout;
  2. pnpm na versão do `packageManager`, Node 24, com cache do pnpm;
  3. `pnpm install --frozen-lockfile`;
  4. `pnpm lint`;
  5. `pnpm typecheck`;
  6. `pnpm test`;
  7. `pnpm db:migrate`;
  8. `pnpm build`;
  9. `pnpm test:e2e:prod`.
- **Playwright em modo produção:**
  - Com `E2E_PROD=1`, o `playwright.config.ts` sobe o app com `pnpm start` em vez de `pnpm dev`.
  - O script `test:e2e:prod` faz o build e roda os testes nesse modo.
  - Os testes que dependem do service worker só rodam nesse modo e são pulados no `pnpm test:e2e`.
- **Navegador:** o Chrome já vem instalado na máquina do GitHub, e o Playwright continua usando `channel: "chrome"`.

## 7. Migrations automáticas no deploy

- O `vercel.json` passa a ter `"buildCommand": "pnpm vercel-build"`.
- O script `vercel-build` roda `src/server/db/migrate-on-deploy.ts` e depois `next build`.
- **`shouldMigrate(env)`:** função pura que decide.

| `VERCEL_ENV` | Branch (`VERCEL_GIT_COMMIT_REF`) | Decisão |
|---|---|---|
| `production` | qualquer | migra |
| `preview` | `staging` | migra |
| `preview` | outro | não migra; avisa no log |
| ausente ou `development` | — | não migra (build local ou CI) |

- **Quando migra:**
  - exige `DATABASE_URL_UNPOOLED`; sem ele, o build falha com "Defina DATABASE_URL_UNPOOLED…";
  - imprime só o host do banco (`describeDatabaseTarget`);
  - aplica as migrations com o migrador do Drizzle sobre `pg`, com uma conexão.
- **Erro:** encerra com código 1, o build falha e a versão anterior continua no ar.
- **Regra registrada no README:** toda migration precisa funcionar com a versão anterior do app ainda no ar.
  - Acrescentar tabela, coluna opcional ou índice pode.
  - Apagar ou renomear se faz em duas etapas, em dois deploys.

## 8. Testes

Vitest contra o Postgres de teste, com os testes escritos antes do código e teste de mutação para cada proteção.

| Área | Casos |
|---|---|
| Manifest da clínica | Nome, `id`, `start_url` e `scope` da clínica; ícones; 404 para slug inexistente; não expõe nada além do nome |
| Manifest do painel | Campos fixos |
| `buildCsp` | Cada diretiva; nonce na política; `unsafe-eval` e `ws:` só em desenvolvimento; `upgrade-insecure-requests` fora de desenvolvimento; `vercel.live` só em Preview |
| `proxy` | Nonce diferente a cada requisição; política na resposta e na requisição repassada; rotas excluídas sem política; manifest do painel liberado sem cookie; redirecionamento do `/admin` mantido |
| `next.config` | Cabeçalhos fixos presentes para todas as rotas |
| `shouldMigrate` | Cada linha da tabela da seção 7; falta de `DATABASE_URL_UNPOOLED` quando migra |
| Navegador (375px) | A página da clínica e o painel declaram o manifest certo; a tela de instalar mostra a instrução de "outros casos" no Chrome de teste; os fluxos existentes e novos falham se o console registrar bloqueio da CSP; os cabeçalhos de segurança estão presentes; **só em modo produção:** o service worker é registrado e, com a rede desligada, a navegação mostra "Sem conexão" |

## 9. Documentação

- **README:**
  - a seção "Neon + Vercel" troca o `pnpm db:migrate` manual pelo automático e traz a regra de migrations compatíveis;
  - novas seções curtas: "Instalar o app", "CI" (o que roda e como exigir no GitHub) e o `pnpm test:e2e:prod`.
- **ROADMAP:**
  - marca o PWA e o CI da Fase 0;
  - fecha as linhas de headers/CSP e de migrations automáticas;
  - acrescenta "logo e cor por clínica no app instalado" à Etapa 2.
- **`.env.example`:** sem mudanças.
- **CLAUDE.md:** sem mudanças.

## 10. Critério de pronto

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` e `pnpm test:e2e:prod` limpos.
- O workflow de CI passa no primeiro PR.
- No navegador em 375px:
  - a página da clínica mostra o link "Instalar app", e a tela de instalar funciona;
  - o console não registra bloqueio da CSP.
- Documentos da seção 9 atualizados.

**Fica com o usuário:**
1. Antes do merge: conferir na Vercel que `DATABASE_URL_UNPOOLED` existe em **Production** (banco de produção) e em **Preview** (banco de staging).
2. Depois do merge, opcional e recomendado: no GitHub, exigir que o CI passe antes do merge em `staging` e `main`.
3. Testar a instalação no celular: Android pelo botão "Instalar"; iPhone pelo Safari.
