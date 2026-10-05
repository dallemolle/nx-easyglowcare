# Fase 0A: Base do projeto (design)

- **Data:** 30/09/2026
- **Status:** aguardando revisão
- **Referências:** `CLAUDE.md` (regras, stack), `ROADMAP.md` (Fase 0)

## 1. Contexto e objetivo

O repositório só tem `CLAUDE.md` e `ROADMAP.md`. A Fase 0 foi dividida em quatro subprojetos, cada um com seu próprio ciclo de spec, plano e implementação:

| Sub | Conteúdo |
|---|---|
| **0A** (esta spec) | Scaffold Next.js, Postgres local em Docker, schema multi-tenant inicial, helper de escopo por tenant com testes, seed "EasyGlowCare", `.env.example`, página `/[slug]` mínima |
| 0B | Grupos de rotas `/minha-conta` e `/admin`, login da equipe, sessão, permissões |
| 0C | Adapters (mensagens, pagamento, assinatura), `message_outbox`, cron, `audit_log` |
| 0D | PWA, headers de segurança e CSP, CI |

O 0A está pronto quando um tenant criado pelo seed aparece em `/easyglowcare`, lido por queries que sempre passam pelo escopo do tenant, e quando o isolamento entre tenants está provado por testes contra Postgres real.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Isolamento por helper na aplicação** (`tenantScope`) + testes de guarda. **RLS do Postgres fica para antes do lançamento** (vira item no ROADMAP) | O custo agora é baixo e funciona com qualquer driver; o RLS exigiria uma transação por request |
| D2 | **Dev local com `postgres:17` + `local-neon-http-proxy` no Docker.** O app usa sempre `@neondatabase/serverless` | O mesmo driver em dev, preview e produção |
| D3 | drizzle-kit, seed e testes usam **`pg` (TCP)** com `DATABASE_URL_UNPOOLED` / `TEST_DATABASE_URL` | Funciona igual com o Docker e com a URL direct do Neon |
| D4 | **FKs compostas** `(tenant_id, x_id) → pai(tenant_id, id)` entre tabelas de negócio | O banco impede que um filho aponte para o pai de outro tenant |
| D5 | O seed troca "Clínica Bella" por **"EasyGlowCare"**; o CLAUDE.md e o ROADMAP.md são atualizados para bater | Pedido do usuário |
| D6 | Neon (projeto em `aws-sa-east-1`, integração com a Vercel, branch por preview) é configurado pelo usuário; o README traz o passo a passo. **Superado:** a infraestrutura real são dois projetos fixos (produção e staging), sem branch por preview (ver `CLAUDE.md`, seção 2) | Depende da conta do usuário |

## 3. Escopo

**Dentro:**
- Scaffold Next 16 (App Router, TS strict, Tailwind 4, ESLint, `src/`, pnpm) e shadcn/ui.
- `docker-compose.yml` e `vercel.json` (`regions: ["gru1"]`).
- Drizzle com a primeira migration e a extensão `btree_gist`.
- Helper de tenant, seed, `.env.example` e `lib/env.ts`.
- Página `/[slug]`.
- Atualizações no CLAUDE.md e no ROADMAP.md.

**Fora:** tudo o que é do 0B, 0C e 0D, além de agenda, OTP, leads e Playwright. O Playwright entra no 0B, junto com o primeiro fluxo interativo.

**Ajuste no scaffold:** o `create-next-app` gera um `CLAUDE.md` próprio. O scaffold é criado numa pasta temporária e copiado para o projeto **sem** esse arquivo. O `AGENTS.md` (regras do Next) é mantido. Com o `AGENTS.md` presente, o `next dev` só atualiza esse arquivo e nunca toca no `CLAUDE.md`; isso foi conferido em `next/dist/server/lib/generate-agent-files.js`.

## 4. Estrutura de pastas

```
docker-compose.yml
docker/init.sql                     # cria easyglowcare e easyglowcare_test
drizzle.config.ts
drizzle/                            # migrations versionadas (nunca editar uma já aplicada)
vitest.config.ts
vercel.json
.env.example
src/
  app/layout.tsx, page.tsx, globals.css
  app/(public)/[slug]/page.tsx
  components/ui/*                   # shadcn: button, card
  lib/env.ts                        # validação com Zod
  lib/utils.ts                      # cn()
  lib/format.ts                     # formatBRL, formatDuration
  server/db/client.ts               # drizzle + neon-serverless; ajuste para o proxy local
  server/db/schema/tenancy.ts       # tenants, locations
  server/db/schema/resources.ts     # rooms, equipment, professionals
  server/db/schema/catalog.ts       # service_categories, services
  server/db/schema/index.ts
  server/db/tenant-scope.ts
  server/db/tenant-scope.test.ts
  server/db/schema.test.ts          # guardas de schema e de import
  server/db/migrate.ts
  server/db/seed.ts
  server/services/tenants.ts        # getTenantBySlug
  test/db.ts                        # conexão de teste, migrate e truncate
```

## 5. Pacotes

| Tipo | Pacotes |
|---|---|
| Dependências | next, react, react-dom, drizzle-orm, @neondatabase/serverless, zod, server-only, lucide-react, e o que o `shadcn init` adicionar (class-variance-authority, clsx, tailwind-merge, tw-animate-css) |
| Dependências de desenvolvimento | drizzle-kit, pg, @types/pg, vitest, vite-tsconfig-paths, tsx, dotenv |

Estes ficam para o subprojeto que os usa:
- jose e @node-rs/argon2: 0B.
- react-hook-form e @hookform/resolvers: 0B.
- @playwright/test: 0B.
- web-push: 0C/0D.
- date-fns e date-fns-tz: quando houver datas na tela.

## 6. Schema

### Convenções
- PK `id uuid default gen_random_uuid()`.
- `created_at` e `updated_at` como `timestamptz not null default now()`.
- Dinheiro em `integer`, em centavos.
- Nomes snake_case no banco e camelCase no TS (opção `casing: "snake_case"` do Drizzle).
- Toda tabela de negócio tem `tenant_id uuid not null references tenants(id) on delete cascade`, índice começando por `tenant_id` e `unique (tenant_id, id)` para servir de alvo às FKs compostas.

### Tabelas

| Tabela | Colunas | Restrições |
|---|---|---|
| `tenants` | slug, name, segment (enum `tenant_segment`: aesthetics, salon, barbershop, other), timezone (default `America/Sao_Paulo`), config jsonb (default `{}`) | `unique(slug)`; `check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` |
| `locations` | tenant_id, name, address, phone, is_active | |
| `rooms` | tenant_id, location_id, name, is_active | FK `(tenant_id, location_id) → locations(tenant_id, id)`; `unique(tenant_id, location_id, name)` |
| `equipment` | tenant_id, location_id, name, is_active | igual a `rooms` |
| `professionals` | tenant_id, display_name, bio, color, is_active | O vínculo com `staff_users` entra no 0B por migration nova |
| `service_categories` | tenant_id, name, slug, position | `unique(tenant_id, slug)` |
| `services` | tenant_id, category_id, name, slug, description, duration_min, price_cents, price_is_from, cleanup_buffer_min, requires_assessment, is_active | FK `(tenant_id, category_id) → service_categories(tenant_id, id)`; `unique(tenant_id, slug)`; `check duration_min > 0`, `price_cents >= 0`, `cleanup_buffer_min >= 0` |

As migrations são:
1. Uma migration custom (`drizzle-kit generate --custom`) com `CREATE EXTENSION IF NOT EXISTS btree_gist;`.
2. A migration gerada a partir do schema.

## 7. Helper de escopo por tenant

```ts
type TenantTable = PgTable & { tenantId: PgColumn };

function tenantScope(db: AnyPgDatabase, tenantId: string): TenantScope;

scope.tenantId
scope.where(table, ...conds)            // and(eq(table.tenantId, tenantId), ...conds)
scope.select(table, ...conds)           // Promise<rows>
scope.insert(table, values | values[])  // remove tenantId de cada valor e grava o do escopo; returning()
scope.update(table, set, ...conds)      // remove tenantId do set; WHERE escopado; returning()
scope.delete(table, ...conds)           // WHERE escopado; returning()
```

**Regras:**
- Tabelas sem `tenantId` não compilam como argumento.
- Um `tenantId` que não é UUID lança `InvalidTenantIdError` na criação do escopo.
- `getTenantBySlug(slug)` (em `server/services/tenants.ts`) devolve `{ tenant, scope } | null`. A página chama `notFound()` quando o resultado é `null`.
- Services recebem um `TenantScope`, nunca o `db`. Hoje, só `server/services/tenants.ts` pode importar `@/server/db/client`. Os próximos subprojetos ampliam essa lista explicitamente no teste 8; o 0B, por exemplo, acrescenta a sessão. O seed e o migrate usam `pg` direto (D3) e não importam o client.

## 8. Ambiente local

**`docker-compose.yml`:**
- **`postgres`:** `postgres:17`, porta 5432, `postgres`/`postgres`, volume `pgdata`. Monta `docker/init.sql`, que cria os bancos `easyglowcare` e `easyglowcare_test`.
- **`neon-proxy`:** `ghcr.io/timowilhelm/local-neon-http-proxy:main`, porta 4444, com `PG_CONNECTION_STRING=postgres://postgres:postgres@postgres:5432/easyglowcare`.

**`client.ts`:** quando o hostname de `DATABASE_URL` é `db.localtest.me`, ajusta o `neonConfig`:
- `fetchEndpoint = h => \`http://${h}:4444/sql\``;
- `wsProxy = h => \`${h}:4444/v2\``;
- `useSecureWebSocket = false`;
- `pipelineTLS = "none"`;
- `pipelineConnect = false`.

Usa `drizzle-orm/neon-serverless` com `Pool`, para ter suporte a transações.

**Scripts:**

| Script | Ação |
|---|---|
| `db:up` / `db:down` | `docker compose up -d` / `docker compose down` |
| `db:generate` / `db:migrate` / `db:studio` | drizzle-kit (o migrate usa `DATABASE_URL_UNPOOLED`) |
| `db:seed` | `tsx src/server/db/seed.ts` |
| `typecheck` | `tsc --noEmit` |
| `test` | `vitest run` |

**`.env.example`:**
- Traz todas as variáveis da seção 8 do CLAUDE.md, cada uma com um comentário curto. As que ainda não são usadas ficam marcadas "(a partir do 0B/0C/0D)".
- Variável nova: `TEST_DATABASE_URL`.
- Os valores padrão apontam para o Docker; os exemplos do Neon ficam comentados.

**`lib/env.ts`:** valida com Zod `DATABASE_URL` (obrigatória) e `NEXT_PUBLIC_APP_URL`. As demais são opcionais por enquanto.

## 9. Seed "EasyGlowCare"

- **Trava de segurança:** sai com erro se o host de `DATABASE_URL_UNPOOLED` não for `localhost`, `127.0.0.1` ou `db.localtest.me`, a menos que receba `--force`.
- **Idempotência:** numa transação, apaga o tenant `easyglowcare` (o cascade limpa o resto) e recria tudo.
- **Tenant:** "EasyGlowCare", slug `easyglowcare`, segmento `aesthetics`, fuso `America/Sao_Paulo`.
- **Local:** 1 unidade com endereço fictício.
- **Recursos:** 2 salas ("Sala 1", "Sala 2") e 1 equipamento ("Laser de diodo").
- **Profissionais:** 3, com cores distintas.
- **Catálogo:** 5 categorias (Facial, Corporal, Depilação, Injetáveis, Capilar) e 15 serviços, 3 por categoria, com preço, duração e buffer realistas. Injetáveis ficam com `requires_assessment = true` e `price_is_from = true`.
- **Os dados são exemplo:** cada clínica cadastra os seus pelo admin (MVP). Nada no código depende deles.

## 10. Página `/[slug]`

- Server Component em `app/(public)/[slug]/page.tsx`.
- Usa `getTenantBySlug`; slug inexistente chama `notFound()`.
- Lista os serviços ativos agrupados por categoria (ordenados por `position`), com nome, duração ("60 min") e preço em BRL ("a partir de R$ 1.200,00" quando `price_is_from`).
- Mobile first: uma coluna em 375px e cards do shadcn.
- `generateMetadata` usa o nome do tenant.

## 11. Testes

Os testes usam Vitest e rodam no banco `easyglowcare_test` do Docker. O setup migra uma vez e faz `TRUNCATE tenants CASCADE` antes de cada teste. Se não conseguir conectar, falha com a mensagem "Postgres de teste indisponível: rode `pnpm db:up`". Os testes são escritos antes da implementação (TDD).

| # | Caso |
|---|---|
| 1 | `select` do tenant A não retorna linhas de B |
| 2 | `insert` com `tenantId` de B passado à força grava como A |
| 3 | `update` e `delete` de A, filtrando pelo id de uma linha de B, afetam 0 linhas, e a linha de B continua intacta |
| 4 | `update` com `tenantId` no `set` não move a linha |
| 5 | `tenantScope(db, "x")` lança `InvalidTenantIdError` |
| 6 | Um INSERT em SQL cru de um `service` de A com `category_id` de B falha na FK composta |
| 7 | Guarda do schema: toda tabela exportada, menos `tenants`, tem a coluna `tenant_id` |
| 8 | Guarda de import: nenhum arquivo em `src/` fora da lista permitida (seção 7) importa `@/server/db/client` |
| 9 | `formatBRL` e `formatDuration` (unidade) |
| 10 | `getTenantBySlug`: slug existente devolve o tenant; slug inexistente devolve `null` |

## 12. Documentação

- **CLAUDE.md:**
  - trocar "Clínica Bella" por "EasyGlowCare";
  - acrescentar `pnpm db:up | pnpm db:down` à seção 9;
  - acrescentar `TEST_DATABASE_URL` à seção 8.
- **ROADMAP.md:**
  - trocar o nome do seed;
  - marcar "Repositório Next.js…" e "Schema multi-tenant (`tenants`, `locations`), helper de escopo por tenant" como feitos;
  - marcar "Functions na região `gru1`" como feito, porque o `vercel.json` já cobre;
  - acrescentar "Ativar RLS no Postgres antes do lançamento" ao backlog de segurança.
- **README.md:** como rodar localmente (`db:up`, `db:migrate`, `db:seed`, `dev`) e o passo a passo do Neon com a Vercel.

## 13. Critério de pronto

- `pnpm typecheck`, `pnpm lint` e `pnpm test` limpos.
- `pnpm build` passando.
- `pnpm db:up && pnpm db:migrate && pnpm db:seed` rodando sem erro, e o seed pode ser rodado duas vezes seguidas.
- `/easyglowcare` mostra 5 categorias e 15 serviços, verificado no navegador em 375px.
- `/nao-existe` devolve 404.
- `.env.example` e os documentos da seção 12 atualizados.
