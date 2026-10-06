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
pnpm test:e2e:prod  # build + Playwright em modo produção (igual ao CI)
pnpm typecheck
pnpm lint
pnpm build
```

## Equipe e login

O painel da equipe fica em `/admin` (login em `/admin/login`). A tela `/admin/equipe`, onde o dono
cadastra e gerencia a equipe, só abre para o papel dono. A área do cliente fica dentro do endereço da
clínica: `/<slug>/entrar` e `/<slug>/minha-conta` (veja "Testar o cadastro de cliente").

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
vazia ele roda normalmente). Para gerar uma: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

`pnpm test:e2e` roda o Playwright com o Google Chrome instalado e precisa do `pnpm db:up`. Antes dos
testes, ele refaz o seed no banco **local** de desenvolvimento com uma senha fixa de teste e limpa a
tabela `login_attempts`; por isso, depois dele, a senha do seed deixa de ser a do seu `.env.local`
(rode `pnpm db:seed` de novo para voltar a ela). Ele se recusa a rodar se `DATABASE_URL` ou
`DATABASE_URL_UNPOOLED` não apontarem para o banco local.

## Testar o cadastro de cliente

O cliente entra em `/<slug>/entrar` (CPF, cadastro e código por WhatsApp ou SMS) e cai em
`/<slug>/minha-conta`. Sem provedor real, o código chega assim:

- **Local:** ponha `OTP_TEST_PHONES=11900000001` no `.env.local`. Esse celular sempre recebe o
  código `000000`. Para qualquer outro número, o provedor `console` imprime o código no terminal
  (só fora de produção).
- **Staging:** cadastre `OTP_TEST_PHONES` **só** no ambiente Preview da Vercel. Com ela em
  Production, o build falha de propósito.
- **Testes de navegador:** `pnpm test:e2e` precisa de `OTP_TEST_PHONES=11900000001` no `.env.local`.

## Instalar o app

O app pode ser instalado no celular, como se fosse um aplicativo. A cliente instala pelo link
"Instalar app" da página da clínica (`/<slug>/instalar`). A equipe instala pelo link "Instalar o
painel no celular" na tela inicial do painel (`/admin/instalar`).

- No Android, toque no botão "Instalar".
- No iPhone, use o Safari: Compartilhar > Adicionar à Tela de Início.
- Instalar é opcional: tudo funciona pelo link, no navegador.
- Sem internet, o app mostra uma página "Sem conexão". Ele não guarda dado nenhum no aparelho.
- O service worker só roda em modo produção (`pnpm build && pnpm start`), não no `pnpm dev`.

## CI

A cada PR para `staging` ou `main`, e a cada push em `staging` e `main`, o GitHub roda o workflow `.github/workflows/ci.yml`: lint,
checagem de tipos, testes, build e os testes de navegador em modo produção. Ele não usa nenhum
segredo: sobe um Postgres próprio e dados de teste.

Para exigir o CI antes do merge, no GitHub vá em Settings > Branches > Add branch ruleset (ou "Add
rule") e crie a regra para `staging` e para `main`. Marque "Require status checks to pass" e escolha
"Lint, tipos, testes, build e navegador". Em repositório privado, exigir o CI antes do merge pode
precisar de plano pago do GitHub.

Se o CI falhar nos testes de navegador, o relatório do Playwright fica em "Artifacts" na página da
execução, por 7 dias.

## Fila de mensagens, auditoria e limpeza

Nenhuma mensagem é enviada na hora: o código grava em `message_outbox` e um cron envia. Em
desenvolvimento, o provedor `console` só imprime no terminal o canal, o modelo e o destinatário
mascarado. As ações de acesso e de equipe ficam registradas em `audit_log` (ainda sem tela;
consulte pelo `pnpm db:studio`).

| Rota | O que faz | Agendamento (`vercel.json`) |
|---|---|---|
| `/api/cron/outbox` | Envia as mensagens vencidas (até 50 por execução, 5 tentativas) | por volta das 06:00 de Brasília, todo dia |
| `/api/cron/cleanup` | Apaga tentativas de login e sessões com mais de 30 dias e mensagens enviadas há mais de 90 | por volta das 06:30 de Brasília, todo dia |

As duas rotas exigem o cabeçalho `Authorization: Bearer <CRON_SECRET>`; sem a variável
`CRON_SECRET` definida, respondem 401 e nada é processado. Para chamar localmente (com
`pnpm dev` rodando e `CRON_SECRET` no `.env.local`), no PowerShell:

```powershell
$env:CRON_SECRET = 'o mesmo valor do .env.local'
Invoke-RestMethod http://localhost:3000/api/cron/outbox -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
Remove-Item Env:CRON_SECRET
```

**Na Vercel:** cadastre `CRON_SECRET` em Production e em Preview, com valores diferentes (gere
com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), antes do
merge e do deploy. A Vercel só entrega uma variável nova aos deploys feitos depois que ela foi
cadastrada. Se cadastrar depois, faça um redeploy; senão os crons respondem 401 todo dia, sem
nenhum aviso além do log. A Vercel envia o cabeçalho sozinha nas chamadas de cron.

Os crons da Vercel só rodam no deploy de produção (`main`). Em staging (Preview) eles não
disparam. Para testar lá, chame as rotas à mão, com o `CRON_SECRET` de Preview, como no exemplo
local (trocando a URL).

O staging tem a proteção de deploys da Vercel ligada. Por isso a chamada à mão precisa também do
cabeçalho `x-vercel-protection-bypass`, com a chave criada em Settings > Deployment Protection >
Protection Bypass for Automation:

```powershell
$env:CRON_SECRET = 'o valor de Preview'
$env:VERCEL_BYPASS = 'a chave do Protection Bypass'
Invoke-RestMethod "https://SEU-ENDERECO-git-staging.vercel.app/api/cron/outbox" -Headers @{ Authorization = "Bearer $env:CRON_SECRET"; 'x-vercel-protection-bypass' = $env:VERCEL_BYPASS }
Remove-Item Env:CRON_SECRET
Remove-Item Env:VERCEL_BYPASS
```

A migration desta parte roda sozinha no deploy, como todas (veja "Neon + Vercel").

**Plano Hobby x Pro:** o plano Hobby só aceita cron uma vez por dia, por isso a fila roda às
06:00. No Hobby o horário não é exato: a chamada pode sair em qualquer momento dentro daquela
hora. Antes de ligar os lembretes (Etapa 4), passe para o plano Pro e troque o agendamento da
fila no `vercel.json` para `*/5 * * * *`. No Hobby, um agendamento mais frequente faz o deploy
falhar.

## Neon + Vercel (preview e produção)

1. No console do Neon, crie **dois projetos** na região **AWS São Paulo (`aws-sa-east-1`)**, um para
   produção e outro para staging. A região não muda depois.
2. Na Vercel, as variáveis de **Production** (`DATABASE_URL` pooled e `DATABASE_URL_UNPOOLED` direta)
   apontam para o banco de produção, e as de **Preview** para o banco de staging.
   **Não** ative "Create database branch for deployment" na integração do Neon: com ela, cada
   Preview, inclusive o staging, ganharia um banco descartável, e as migrations automáticas de
   staging iriam para ele.

Antes de um deploy (é a lista de conferência de qualquer deploy), siga estes passos **nesta ordem**:

1. Cadastre `SESSION_SECRET` na Vercel (Settings > Environment Variables), **em Production e em Preview, com valores diferentes**. Gere cada valor com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. As migrations rodam sozinhas no build da Vercel, em produção (`main`) e no staging; outros
   branches não alteram nenhum banco. Confira que `DATABASE_URL_UNPOOLED` existe em Production
   (banco de produção) e em Preview (banco de staging). Se uma migration falhar, o deploy falha e
   a versão anterior continua no ar.

   Toda migration precisa funcionar com a versão anterior do app ainda no ar: acrescentar tabela,
   coluna opcional ou índice pode; apagar ou renomear se faz em duas etapas, em dois deploys.

   Só em emergência, para aplicar à mão em um banco remoto, use a URL direta. No PowerShell:

   ```powershell
   $env:DATABASE_URL_UNPOOLED = "postgres://…"
   pnpm db:migrate
   Remove-Item Env:DATABASE_URL_UNPOOLED
   ```

   A variável de ambiente tem precedência sobre o `.env.local` (que aponta para o Docker) e **continua
   definida até você fechar a janela do terminal ou rodar o `Remove-Item`**. Se esquecer, os próximos
   comandos nessa janela vão atingir o banco remoto. Coloque a URL só na sua linha de comando; nunca
   a grave em arquivo versionado.
3. Faça o merge e o deploy.
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

**Fora de ordem:** sem `SESSION_SECRET` ou sem `DATABASE_URL_UNPOOLED` (em produção ou no
staging), o build falha e o deploy anterior continua no ar. O mesmo vale se uma migration falhar.

Os Previews de PR usam o banco de staging, sem migrar. Um PR que traz migration nova fica com o
Preview quebrado até o merge em `staging`.

**A clínica.** `staff:create --tenant <slug>` exige que a clínica já exista; senão responde
"Clínica não encontrada: <slug>". Hoje a única forma de criar uma clínica é o seed. Em produção ele
só pode ser usado **uma vez, em banco vazio**, com `pnpm db:seed -- --force` (URL direta definida
como acima): cria a clínica de exemplo `easyglowcare` e também os 5 usuários de exemplo, então
desative-os em `/admin/equipe` depois de criar o seu dono. Depois que houver dados reais, **nunca**
rode o seed em produção: ele apaga e recria a clínica `easyglowcare`.

**Dono sem acesso.** Não há "esqueci minha senha": se o dono perder o acesso, crie outro dono com
`pnpm staff:create`, usando outro e-mail.

**Staging e Previews.** Todos os Previews (o staging e os de PR) usam o mesmo banco de staging; não
existe banco por Preview. **Não rode o seed em staging:** ele apaga e recria a clínica
`easyglowcare`, junto com os usuários e registros dela. Sem `--force`, o seed recusa qualquer banco
que não seja local.

As Functions rodam em `gru1` (São Paulo), definido no `vercel.json`.
