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
pnpm test:e2e     # Playwright; veja "Equipe e login"
pnpm typecheck
pnpm lint
pnpm build
```

## Equipe e login

O painel da equipe fica em `/admin` (login em `/admin/login`). A tela `/admin/equipe`, onde o dono
cadastra e gerencia a equipe, só abre para o papel dono. A área do cliente (`/minha-conta`) ainda é
um espaço reservado.

O `pnpm db:seed` cria estes usuários de exemplo (só para desenvolvimento e staging):

| E-mail | Nome | Papel |
|---|---|---|
| `dono@easyglowcare.test` | Marina Alves | dono |
| `recepcao@easyglowcare.test` | Paulo Reis | recepção |
| `ana@easyglowcare.test`, `beatriz@easyglowcare.test`, `carla@easyglowcare.test` | profissionais | profissional |

A senha de todos é a variável `SEED_STAFF_PASSWORD` do `.env.local`, quando definida (de 10 a 128
caracteres). Sem ela, o seed gera uma senha e a imprime no terminal; anote-a, porque ela não é
mostrada de novo. Nunca rode o seed em produção.

A variável `SESSION_SECRET` (mínimo de 32 caracteres) é obrigatória: sem ela o app, o build e os
scripts falham. Para gerar uma: `openssl rand -base64 32`.

`pnpm test:e2e` roda o Playwright com o Google Chrome instalado e precisa do `pnpm db:up`. Antes dos
testes, ele refaz o seed no banco **local** de desenvolvimento com uma senha fixa de teste e limpa a
tabela `login_attempts`; por isso, depois dele, a senha do seed deixa de ser a do seu `.env.local`
(rode `pnpm db:seed` de novo para voltar a ela). Ele se recusa a rodar se `DATABASE_URL` ou
`DATABASE_URL_UNPOOLED` não apontarem para o banco local.

## Neon + Vercel (preview e produção)

1. No console do Neon, crie o projeto na região **AWS São Paulo (`aws-sa-east-1`)**. A região não muda depois.
2. Na Vercel, instale a integração **Neon** no projeto e ative **"Create database branch for deployment: Preview"**.
   A integração injeta `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED` (direta) em cada ambiente.
3. Cadastre `SESSION_SECRET` na Vercel (Settings > Environment Variables), **em Production e em Preview, com valores diferentes**. Gere cada valor com `openssl rand -base64 32`. Sem ela o build falha.
4. Aplique as migrations em cada banco (produção e staging; a mais recente é a `0002_staff_auth`)
   com a URL direta. No PowerShell:

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://…"
   pnpm db:migrate
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```

   A variável de ambiente tem precedência sobre o `.env.local` (que aponta para o Docker) e **continua
   definida até você fechar a janela do terminal ou rodar o `Remove-Item`**. Se esquecer, os próximos
   comandos nessa janela vão atingir o banco remoto. Coloque a URL só na sua linha de comando; nunca
   a grave em arquivo versionado.
5. Crie o primeiro dono em produção (e em staging). O comando imprime uma senha provisória uma única
   vez, e a pessoa precisa trocá-la no primeiro login:

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://…"
   pnpm staff:create -- --tenant <slug> --name "<nome>" --email <e-mail> --role owner
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```

   `--role` aceita `owner`, `reception` ou `professional`. Os demais usuários podem ser criados
   depois pelo dono, em `/admin/equipe`.
6. Opcional: para popular um branch de preview com a clínica de exemplo (e os usuários de exemplo,
   com a senha de `SEED_STAFF_PASSWORD` ou uma senha gerada e impressa), defina a URL direta do
   branch como acima e rode `pnpm db:seed -- --force`. Sem `--force`, o seed recusa qualquer banco
   que não seja local. O `.env.local` não precisa existir (o script usa `--env-file-if-exists`).
   Nunca rode o seed em produção.

As Functions rodam em `gru1` (São Paulo), definido no `vercel.json`.
