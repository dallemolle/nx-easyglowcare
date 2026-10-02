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
| `ana@easyglowcare.test` | Ana Souza | profissional |
| `beatriz@easyglowcare.test` | Beatriz Lima | profissional |
| `carla@easyglowcare.test` | Dra. Carla Mendes | profissional |

A senha de todos é a variável `SEED_STAFF_PASSWORD` do `.env.local`, quando definida (de 10 a 128
caracteres). Sem ela, o seed gera uma senha e a imprime no terminal; anote-a, porque ela não é
mostrada de novo. Em produção o seed só pode ser usado uma vez, em banco vazio, com `--force` (veja
"Neon + Vercel"); depois que houver dados reais, nunca o rode em produção.

A variável `SESSION_SECRET` (mínimo de 32 caracteres) é obrigatória para o app e para o build: sem
ela o login e as sessões não funcionam. O script `pnpm staff:create` não a usa (verificado: com ela
vazia ele roda normalmente). Para gerar uma: `openssl rand -base64 32`.

`pnpm test:e2e` roda o Playwright com o Google Chrome instalado e precisa do `pnpm db:up`. Antes dos
testes, ele refaz o seed no banco **local** de desenvolvimento com uma senha fixa de teste e limpa a
tabela `login_attempts`; por isso, depois dele, a senha do seed deixa de ser a do seu `.env.local`
(rode `pnpm db:seed` de novo para voltar a ela). Ele se recusa a rodar se `DATABASE_URL` ou
`DATABASE_URL_UNPOOLED` não apontarem para o banco local.

## Neon + Vercel (preview e produção)

1. No console do Neon, crie o projeto na região **AWS São Paulo (`aws-sa-east-1`)**. A região não muda depois.
2. Na Vercel, instale a integração **Neon** no projeto e ative **"Create database branch for deployment: Preview"**.
   A integração injeta `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED` (direta) em cada ambiente.
Antes do primeiro deploy da Fase 0B (login da equipe), siga estes passos **nesta ordem**:

1. Cadastre `SESSION_SECRET` na Vercel (Settings > Environment Variables), **em Production e em Preview, com valores diferentes**. Gere cada valor com `openssl rand -base64 32`.
2. Aplique as migrations em cada banco (produção e staging) com a URL direta; a mais recente é a
   `0002_staff_auth`. Ela só acrescenta tabelas e uma coluna, então é segura de aplicar com a versão
   antiga do app ainda no ar. No PowerShell:

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://…"
   pnpm db:migrate
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```

   A variável de ambiente tem precedência sobre o `.env.local` (que aponta para o Docker) e **continua
   definida até você fechar a janela do terminal ou rodar o `Remove-Item`**. Se esquecer, os próximos
   comandos nessa janela vão atingir o banco remoto. Coloque a URL só na sua linha de comando; nunca
   a grave em arquivo versionado.
3. Só então faça o merge e o deploy.
4. Garanta que a clínica existe (veja "A clínica" abaixo).
5. Crie o primeiro dono. O comando imprime o banco de destino (só o host) e a clínica antes de
   inserir, e depois uma senha provisória, uma única vez; a pessoa precisa trocá-la no primeiro login:

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://…"
   pnpm staff:create -- --tenant <slug> --name "<nome>" --email <e-mail> --role owner
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```

   `--role` aceita `owner`, `reception` ou `professional`. Os demais usuários podem ser criados
   depois pelo dono, em `/admin/equipe`.

**Fora de ordem:** sem `SESSION_SECRET` o build falha (o deploy anterior continua no ar). Com o
deploy antes da migration, a página pública segue funcionando, mas todo login dá erro.

**A clínica.** `staff:create --tenant <slug>` exige que a clínica já exista; senão responde
"Clínica não encontrada: <slug>". Hoje a única forma de criar uma clínica é o seed. Em produção ele
só pode ser usado **uma vez, em banco vazio**, com `pnpm db:seed -- --force` (URL direta definida
como acima): cria a clínica de exemplo `easyglowcare` e também os 5 usuários de exemplo, então
desative-os em `/admin/equipe` depois de criar o seu dono. Depois que houver dados reais, **nunca**
rode o seed em produção: ele apaga e recria a clínica `easyglowcare`.

**Dono sem acesso.** Não há "esqueci minha senha": se o dono perder o acesso, crie outro dono com
`pnpm staff:create`, usando outro e-mail.

**Preview.** Para popular um branch de preview com a clínica de exemplo (e os usuários de exemplo,
com a senha de `SEED_STAFF_PASSWORD` ou uma senha gerada e impressa), defina a URL direta do branch
como acima e rode `pnpm db:seed -- --force`. Sem `--force`, o seed recusa qualquer banco que não
seja local. O `.env.local` não precisa existir (o script usa `--env-file-if-exists`).

As Functions rodam em `gru1` (São Paulo), definido no `vercel.json`.
