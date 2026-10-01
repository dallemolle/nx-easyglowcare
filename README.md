# EasyGlowCare

Web app (PWA) de agendamento e CRM para clínicas de estética, multi-tenant.
Regras do projeto em [CLAUDE.md](CLAUDE.md); plano de entregas em [ROADMAP.md](ROADMAP.md).

## Rodar localmente

Pré-requisitos: Node 24, pnpm e Docker.

```bash
cp .env.example .env.local
pnpm install
pnpm db:up        # Postgres 17 + proxy do Neon (docker-compose.yml)
pnpm db:migrate
pnpm db:seed      # clínica de exemplo "EasyGlowCare"
pnpm dev          # http://localhost:3000/easyglowcare
```

O app usa o driver `@neondatabase/serverless` em todos os ambientes. Em dev, ele fala com o
`local-neon-http-proxy` do Docker pelo host `db.localtest.me`, que resolve para `127.0.0.1`.
Esse host depende de DNS público, então em dev é preciso estar online.

## Testes e checagens

```bash
pnpm test         # Vitest; usa o banco easyglowcare_test (precisa do pnpm db:up)
pnpm typecheck
pnpm lint
pnpm build
```

## Neon + Vercel (preview e produção)

1. No console do Neon, crie o projeto na região **AWS São Paulo (`aws-sa-east-1`)**. A região não muda depois.
2. Na Vercel, instale a integração **Neon** no projeto e ative **"Create database branch for deployment: Preview"**.
   A integração injeta `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED` (direta) em cada ambiente.
3. Aplique as migrations no banco principal com a URL direta:
   `DATABASE_URL_UNPOOLED="postgres://…" pnpm db:migrate`
4. Opcional: para popular um branch de preview com a clínica de exemplo, passe a URL direta do
   branch na linha de comando (ela tem precedência sobre o `.env.local`, que aponta para o Docker):
   `DATABASE_URL_UNPOOLED="postgres://…" pnpm db:seed -- --force`.
   Sem `--force`, o seed recusa qualquer banco que não seja local. O script lê o `.env.local`,
   então esse arquivo precisa existir.

As Functions rodam em `gru1` (São Paulo), definido no `vercel.json`.
