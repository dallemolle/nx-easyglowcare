# CLAUDE.md — App de Clínica de Estética (agendamento + CRM)

> Este arquivo fica na raiz do repositório. O Claude Code o lê automaticamente no início de cada sessão.
> O plano de entregas, o backlog e os recursos externos estão em `ROADMAP.md`.

## 1. O produto

Web app (PWA) para clínicas de estética, com três públicos:

- **Cliente final**: faz pré-cadastro sem senha (nome, CPF, telefone), navega no catálogo, agenda, paga, acompanha pacotes e preenche anamnese.
- **Equipe da clínica**: dono, recepção e profissionais usam o painel admin (agenda, CRM de leads, prontuário, financeiro).
- **Futuro SaaS**: o mesmo sistema atende vários negócios (estética, salão, barbearia etc.), cada um com página pública em `app.com/<slug>`.

**Diferencial**: entrada sem atrito. O visitante vira **lead** com nome + CPF + telefone e já vê o catálogo. A conta de **cliente** só nasce no primeiro agendamento, pagamento ou atendimento. O "login" posterior é um código enviado por WhatsApp/SMS.

## 2. Infraestrutura disponível

- **Vercel** (hospedagem, Functions, Cron, Blob, Analytics). Região das Functions: `gru1` (São Paulo).
- **Neon** (Postgres serverless), região `aws-sa-east-1` (São Paulo), para latência baixa e dados no Brasil. **Dois projetos separados, fixos:**
  - **produção** (banco `nxegcprod`): variáveis da Vercel em **Production** (branch `main`);
  - **staging** (banco `nxegcstg`): variáveis da Vercel em **Preview**. Todo Preview usa esse banco, inclusive os de PR.
- **Decisão do dono, não alterar:** não usar branch de banco por Preview ("Create database branch for deployment"), não criar outros bancos e não trocar essa configuração. As migrations rodam no build da Vercel e precisam atingir o banco de staging (ver `src/server/db/deploy-migration.ts`). Qualquer mudança na infraestrutura de banco exige pedido explícito do dono.

Tudo que depende de outro serviço (WhatsApp, SMS, e-mail, pagamento, assinatura digital etc.) é implementado **atrás de uma interface (adapter)** com uma implementação `console`/`mock` para desenvolvimento. Nunca acople regra de negócio a um fornecedor.

## 3. Stack obrigatória

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router) + TypeScript `strict` |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Formulários/validação | react-hook-form + Zod (schemas compartilhados entre client e server) |
| Banco | Neon Postgres + Drizzle ORM + drizzle-kit (migrations versionadas) |
| Driver | `@neondatabase/serverless` (pooling do Neon) |
| Sessão | Cookie httpOnly assinado (`jose`) + tabela `sessions` no Postgres |
| Arquivos | Vercel Blob: `public` para imagens do catálogo, `private` para fotos clínicas, anamnese e termos |
| Datas | `date-fns` + `date-fns-tz`; gravar em UTC (`timestamptz`), exibir no fuso do tenant |
| Testes | Vitest (unidade) + Playwright (fluxos críticos) |
| PWA | manifest + service worker; Web Push com VAPID (`web-push`) |
| Gerenciador | pnpm |

Não introduza outras bibliotecas grandes sem justificar no PR.

## 4. Regras de arquitetura

1. **Multi-tenant desde o dia 1**: toda tabela de negócio tem `tenant_id`. Toda query passa por um helper que injeta o tenant da sessão/rota. Nunca consulte sem filtrar por tenant.
2. **Pastas**:
   ```
   src/
     app/(public)/[slug]/...      # site público do negócio: catálogo, agendar
     app/(public)/[slug]/entrar, minha-conta  # entrada e área do cliente (dentro do endereço da clínica)
     app/(admin)/admin/...         # painel da clínica
     app/api/...                   # webhooks, cron, endpoints
     server/db/schema/*.ts         # schema Drizzle por domínio
     server/services/*.ts          # regras de negócio (sem acesso a Request/Response)
     server/adapters/*             # messaging, payments, signature, calendar...
     lib/validation/*.ts           # schemas Zod
     components/ui/*               # shadcn
   ```
3. **Server Actions** para mutações da UI; **Route Handlers** para webhooks e cron.
4. **Adapters** (interface + implementação dev):
   - `MessagingProvider`: `sendOtp`, `sendTemplate` (canais: whatsapp, sms, email, push)
   - `PaymentProvider`: `createPixCharge`, `createCardCharge`, `refund`, `parseWebhook`
   - `SignatureProvider`: `requestSignature`, `getStatus` (dev: aceite eletrônico interno)
   - `CalendarSync` (backlog)
   Seleção via variável de ambiente (`MESSAGING_PROVIDER=console|meta|twilio...`).
5. **Outbox de mensagens**: nada é enviado "na hora" dentro da regra de negócio. Grave em `message_outbox` (canal, template, payload, `send_at`, status, tentativas). Um cron processa a fila. Isso resolve lembretes 24h/2h, pós-procedimento, aniversário e retorno.
6. **Idempotência** em webhooks de pagamento (tabela `webhook_events` com `provider_event_id` único).
7. **Auditoria**: tabela `audit_log` para ações sensíveis (ver/editar prontuário, exportar dados, alterar preço, estornar).

## 5. Modelo de dados (ponto de partida)

- **Tenancy**: `tenants` (slug, segmento, fuso, config JSON), `locations`
- **Equipe**: `staff_users` (papel em enum `staff_role`: owner, reception, professional), `professionals`, `professional_services`, `working_hours`, `time_blocks` (folga, feriado, manutenção)
- **Recursos**: `rooms`, `equipment`, `service_resource_requirements`
- **Catálogo**: `service_categories`, `services` (duração, preço, "a partir de", buffer de higienização, requer avaliação), `service_media`, `products`, `packages`, `package_items`
- **Pessoas**: `people` (status `lead` | `client`, nome, CPF, telefone, e-mail, nascimento, origem, UTMs), `person_consents` (versão do termo, data/hora, IP, user-agent), `otp_codes` (hash do código, expiração, tentativas), `sessions`, `login_attempts` (tentativas de login da equipe, para o limite)
- **CRM**: `lead_stages`, `lead_events`, `tasks`
- **Agenda**: `appointments` (status, origem, sinal), `appointment_items` (serviços em sequência), `appointment_resources` (profissional/sala/equipamento + `tstzrange`), `waitlist_entries`, `recurrence_rules`
- **Comercial**: `package_purchases`, `package_balance_ledger`, `coupons`, `gift_cards`, `wallet_ledger`, `orders`, `payments`, `webhook_events`
- **Clínico**: `anamnesis_templates`, `anamnesis_responses`, `consent_terms`, `consent_signatures`, `clinical_records`, `clinical_photos`, `stock_items`, `stock_movements`
- **Relacionamento**: `message_templates`, `message_outbox`, `reviews`, `referrals`
- **Sistema**: `audit_log`

**Anti-conflito de agenda no banco** (obrigatório): extensão `btree_gist` e restrição de exclusão em `appointment_resources`:
```sql
EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (status IN ('booked','confirmed'))
```
O intervalo `during` já inclui o buffer de higienização. Isso impede dupla reserva mesmo com requisições simultâneas.

## 6. LGPD e dados sensíveis

- CPF: validar dígitos, gravar só números, único por tenant. Exibir mascarado (`***.456.789-**`) fora de telas que precisam dele.
- Anamnese, prontuário e fotos clínicas são **dados de saúde (dados pessoais sensíveis)**. Guardar fotos em Blob **privado**; entregar só via rota autenticada ou URL assinada de curta duração. Colunas sensíveis criptografadas na aplicação (AES-GCM, chave em env `DATA_ENCRYPTION_KEY`).
- Consentimento: registrar versão do texto, data/hora, IP e user-agent. Consentimentos separados para termos, marketing e uso de imagem (galeria antes/depois).
- Rotas de direitos do titular: exportar meus dados, solicitar exclusão/anonimização.
- Nunca logar CPF, telefone completo, código OTP ou dados clínicos.

## 7. Segurança

- OTP: 6 dígitos, validade 5 min, máx. 5 tentativas, guardar só o hash. Limite de envio por telefone e por IP (tabela de contagem no Postgres até haver Redis).
- Cron e webhooks: validar `CRON_SECRET` e a assinatura do provedor.
- Permissões checadas no servidor (nunca só esconder botão).
- Headers de segurança e CSP no `next.config`.

## 8. Variáveis de ambiente

```
DATABASE_URL=                 # Neon (pooled)
DATABASE_URL_UNPOOLED=        # Neon (migrations)
TEST_DATABASE_URL=            # Postgres de teste (Docker)
SESSION_SECRET=
SEED_STAFF_PASSWORD=          # só para o seed de dev
DATA_ENCRYPTION_KEY=
CRON_SECRET=
BLOB_READ_WRITE_TOKEN=        # só fora da Vercel; na Vercel usar OIDC
NEXT_PUBLIC_APP_URL=
VAPID_PUBLIC_KEY= / VAPID_PRIVATE_KEY=
MESSAGING_PROVIDER=console
OTP_TEST_PHONES=              # só fora de produção
PAYMENT_PROVIDER=mock
SIGNATURE_PROVIDER=internal
```
Mantenha `.env.example` sempre atualizado.

## 9. Comandos

```
pnpm dev | pnpm build | pnpm lint | pnpm typecheck
pnpm test | pnpm test:e2e
pnpm db:generate | pnpm db:migrate | pnpm db:seed | pnpm db:studio
pnpm staff:create             # cria usuário da equipe (ex.: o primeiro dono)
pnpm db:up | pnpm db:down     # Postgres + proxy do Neon no Docker
```

## 10. Como trabalhar neste repositório

- Antes de uma funcionalidade nova: entrar em modo de planejamento, listar arquivos, tabelas e migrations, e esperar aprovação.
- Uma funcionalidade por branch/PR. Commits pequenos, mensagens em português no imperativo.
- Toda mudança de schema gera migration versionada; nunca editar migration já aplicada.
- Seed com um tenant de exemplo ("EasyGlowCare"), 3 profissionais, 2 salas, 1 equipamento e 15 serviços.
- **Pronto** = typecheck e lint limpos, testes passando, fluxo testado no navegador em largura de celular (375px), `.env.example` e `ROADMAP.md` atualizados (marcar o item como feito).
- Interface em português do Brasil; moeda BRL; datas `dd/MM/yyyy`; telefone com máscara `(99) 99999-9999`.
- Mobile first: a maioria dos clientes chega pelo Instagram no celular.
