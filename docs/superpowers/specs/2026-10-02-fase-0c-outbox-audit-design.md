# Fase 0C: Fila de mensagens, adapters, auditoria e limpeza (design)

- **Data:** 02/10/2026
- **Status:** aguardando revisão
- **Referências:** `CLAUDE.md` (seções 4, 6 e 7), `ROADMAP.md` (Fase 0), specs do 0A e do 0B

## 1. Contexto e objetivo

O 0A entregou a base multi-tenant e o 0B o login da equipe. O 0C entrega a infraestrutura que as etapas do MVP vão usar para se comunicar e para deixar rastro:
- a fila de mensagens com cron;
- os adapters de serviços externos em modo de desenvolvimento;
- o registro de auditoria;
- a limpeza automática de dados pessoais antigos.

O 0C está pronto quando:
- uma mensagem enfileirada é entregue ao provedor `console` pelo cron, com novas tentativas em caso de falha e sem envio duplicado por execuções simultâneas;
- as ações de acesso e de equipe ficam registradas no `audit_log`;
- registros antigos de `login_attempts`, `sessions` e mensagens enviadas são apagados sozinhos.

Nenhuma tela nova. Nenhuma mensagem real usa a fila ainda: o código de verificação é da Etapa 1 e os lembretes são da Etapa 4.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Cron diário** para a fila e para a limpeza | O projeto está no plano Hobby da Vercel, que só aceita cron uma vez por dia; um agendamento mais frequente faz o deploy falhar. O README documenta a troca para 5 minutos no Pro |
| D2 | **Reserva com prazo (lease):** o processador reserva um lote com `FOR UPDATE SKIP LOCKED`, marca `sending` com `locked_until` e envia fora da transação | Duas execuções simultâneas não enviam a mesma mensagem, e uma execução que morre não prende a mensagem para sempre |
| D3 | **Entrega "ao menos uma vez"** | Se o provedor aceitar e a gravação do sucesso falhar, a mensagem pode sair de novo; é o padrão desse tipo de fila |
| D4 | **`sendOtp` fora da fila**, chamado direto | Quem está fazendo login não pode esperar o cron. Todo o resto passa pela fila |
| D5 | **Auditoria só com registro, sem tela** | A consulta fica no banco até o MVP, quando houver prontuário e preços |
| D6 | **Falha ao auditar não desfaz a ação** | Desfazer exigiria transações no `tenantScope`, que ainda não existem (item do ROADMAP). O erro vai para o log do servidor |
| D7 | **Auditoria registrada nos pontos de chamada** (Server Actions, `current.ts`, CLI), e não dentro dos services | É onde estão o ator, o IP e o escopo |
| D8 | **`CRON_SECRET` opcional no ambiente; rotas de cron fecham sem ele** | Esquecer a variável não derruba o site; só deixa os crons sem processar |
| D9 | **Um único módulo novo com acesso direto ao banco** (`src/server/jobs/run.ts`) | Os crons processam todas as clínicas de uma vez e não passam pelo `tenantScope` |
| D10 | **`audit_log` nunca é apagado pelo sistema**; mensagens `failed` ficam para investigação | Prazo de guarda da auditoria é decisão do dono, com orientação jurídica |

## 3. Escopo

**Dentro:**
- tabelas `message_outbox` e `audit_log`;
- adapters de mensagens, pagamento e assinatura com implementação de desenvolvimento;
- `enqueueMessage`, processador da fila e rota de cron;
- `recordAudit` e sua chamada nas ações de acesso e de equipe existentes;
- job de limpeza e rota de cron;
- documentação.

**Fora:**
- qualquer tela;
- provedores reais (WhatsApp, SMS, e-mail, gateway, assinatura digital);
- modelos de mensagem (`message_templates`) e textos: entram com a Etapa 4;
- tabelas de pagamento (`payments`, `webhook_events`) e de assinatura: V2;
- CI e migrations automáticas: 0D.

## 4. Schema (uma migration nova, só acrescenta)

Valem as convenções do 0A: `tenantColumns()`, índice começando por `tenant_id`, `unique(tenant_id, id)`.

### `message_outbox`

| Coluna | Tipo | Observação |
|---|---|---|
| tenant_id | uuid, obrigatório | FK com cascade |
| channel | enum `message_channel`: whatsapp, sms, email, push | |
| template | text | Nome do modelo, por exemplo `appointment.reminder_24h` |
| recipient | text | Telefone (só dígitos) ou e-mail |
| payload | jsonb, padrão `{}` | Variáveis do modelo |
| send_at | timestamptz | Quando enviar |
| status | enum `message_status`: pending, sending, sent, failed; padrão pending | |
| attempts | integer, padrão 0 | |
| locked_until | timestamptz, nulo | Prazo da reserva |
| last_error | text, nulo | Só o tipo do erro, sem dado pessoal |
| dedupe_key | text, nulo | `unique(tenant_id, dedupe_key)` |
| sent_at | timestamptz, nulo | |
| provider_message_id | text, nulo | |

Índice `(status, send_at)` para o processador.

### `audit_log`

| Coluna | Tipo | Observação |
|---|---|---|
| tenant_id | uuid, obrigatório | FK com cascade |
| actor_type | enum `audit_actor_type`: staff, system | |
| actor_id | uuid, nulo | Id do `staff_users`; nulo quando `system` |
| action | text | Lista fechada no código (seção 7) |
| entity | text | Por exemplo `staff_user` |
| entity_id | uuid, nulo | |
| metadata | jsonb, padrão `{}` | Sem dado sensível |
| ip | text, nulo | |

Só tem `id` e `created_at` (sem `updated_at`): a tabela nunca é atualizada. Índice `(tenant_id, created_at)`.

## 5. Adapters (`src/server/adapters/`)

Cada adapter tem `types.ts` (interface), a implementação de desenvolvimento e `index.ts` com `getXProvider()`, que lê a variável de ambiente e lança erro claro para valor desconhecido.

| Adapter | Variável (padrão) | Interface | Implementação de desenvolvimento |
|---|---|---|---|
| `MessagingProvider` | `MESSAGING_PROVIDER` (`console`) | `sendOtp({ channel, recipient, code })`, `sendTemplate({ channel, recipient, template, payload })`; ambos devolvem `{ providerMessageId }` | `console`: imprime canal, modelo e destinatário mascarado. O código OTP só é impresso quando `NODE_ENV !== "production"` |
| `PaymentProvider` | `PAYMENT_PROVIDER` (`mock`) | `createPixCharge`, `createCardCharge`, `refund`, `parseWebhook` | `mock`: devolve dados falsos e determinísticos a partir da entrada |
| `SignatureProvider` | `SIGNATURE_PROVIDER` (`internal`) | `requestSignature`, `getStatus` | `internal`: aceite eletrônico; devolve um id e o status `signed` |

**Mascaramento do destinatário** (`maskRecipient` em `src/lib/format.ts`):
- telefone: mostra só os 4 últimos dígitos (`*******1234`);
- e-mail: primeira letra e o domínio (`m***@exemplo.com`).

Os adapters de pagamento e de assinatura não têm tabela nem consumidor no 0C; só interface, implementação falsa e testes.

## 6. Fila de mensagens

### Enfileirar (`src/server/services/outbox.ts`)

`enqueueMessage(scope, { channel, template, recipient, payload?, sendAt?, dedupeKey? })`:
- valida a entrada com Zod (`channel` no enum; `template` e `recipient` não vazios);
- grava pelo escopo com `send_at = sendAt ?? agora`;
- com `dedupeKey` repetida na mesma clínica, não cria segunda linha e devolve a existente (violação de unicidade tratada, sem consulta prévia).

### Processar (`src/server/jobs/outbox.ts`)

`processOutbox(db, provider, now?)` devolve `{ claimed, sent, retried, failed }`.

1. **Reserva:** numa transação, seleciona até **50** linhas com `FOR UPDATE SKIP LOCKED` onde:
   - `status = 'pending'` e `send_at <= now`; ou
   - `status = 'sending'` e `locked_until < now` (reserva expirada).

   Marca todas como `sending`, com `locked_until = now + 5 min` e `attempts = attempts + 1`, e confirma a transação.
2. **Envio:** para cada linha reservada, fora da transação, chama `provider.sendTemplate`.
3. **Sucesso:** `status = 'sent'`, `sent_at = now`, `provider_message_id`, `locked_until = null`.
4. **Falha:** se `attempts < 5`, volta a `pending` com `send_at = now + espera` e `last_error`; senão vira `failed`.

| Tentativa que falhou | Espera até a próxima |
|---|---|
| 1ª | 1 minuto |
| 2ª | 5 minutos |
| 3ª | 30 minutos |
| 4ª | 2 horas |
| 5ª | vira `failed` |

- **`last_error`:** guarda `error.name` e, se houver, o código do provedor; nunca `error.message`, que pode conter o destinatário.
- **Log:** uma linha por execução com as contagens; nunca destinatário nem payload.
- **Ordem:** as mensagens são reservadas por `send_at` crescente.

## 7. Auditoria

### Registrar (`src/server/services/audit.ts`)

`recordAudit(scope, { actor, action, entity, entityId?, metadata?, ip? })`:
- `actor` é `{ type: "staff", id }` ou `{ type: "system" }`;
- `action` é de um tipo fechado `AuditAction` (lista abaixo);
- grava pelo escopo.

`safeRecordAudit(...)` envolve a chamada: em caso de erro, loga `describeUnexpectedError(error)` e não propaga (D6). É a função usada nos pontos de chamada.

### Ações e onde são registradas

| Ação | Ponto de chamada | `entity` / `metadata` |
|---|---|---|
| `auth.login` | `signIn` em `current.ts`, após sucesso | `staff_user` / `{}` |
| `auth.logout` | `signOut` em `current.ts` | `staff_user` / `{}` |
| `auth.password_changed` | action de trocar senha | `staff_user` / `{}` |
| `staff.created` | `createStaffAction` e `staff-create.ts` (ator `system`) | `staff_user` / `{ role }` |
| `staff.role_changed` | `changeRoleAction` | `staff_user` / `{ from, to }` |
| `staff.deactivated` / `staff.reactivated` | `setActiveAction` | `staff_user` / `{}` |
| `staff.password_reset` | `resetPasswordAction` | `staff_user` / `{}` |

Mudanças necessárias em código existente:
- `login` (`src/server/auth/login.ts`) passa a devolver também `staffUserId` e `tenantId` no resultado de sucesso, para o `signIn` montar o escopo e o ator.
- `changeStaffRole` passa a devolver o papel anterior, para o `metadata`.
- O IP vem de `clientIp(x-forwarded-for)`, como no login.

Tentativas de login que falham **não** vão para o `audit_log`; continuam em `login_attempts`.

O `metadata` nunca contém senha, senha provisória, token, e-mail, CPF ou conteúdo clínico.

## 8. Limpeza (`src/server/jobs/cleanup.ts`)

`cleanupOldData(db, now?)` devolve as contagens apagadas por tabela.

| Dado | Regra |
|---|---|
| `login_attempts` | `created_at < now - 30 dias` |
| `sessions` | `expires_at < now - 30 dias` ou `revoked_at < now - 30 dias` |
| `message_outbox` com `status = 'sent'` | `sent_at < now - 90 dias` |
| `message_outbox` com `status = 'failed'` | Não apaga |
| `audit_log` | Não apaga |

## 9. Rotas de cron

- `src/server/jobs/run.ts`: `runOutboxJob()` e `runCleanupJob()`, que ligam os jobs ao `db` do app e ao provedor configurado. É o único arquivo novo que importa `@/server/db/client`; a lista do teste de guarda passa a ter três entradas.
- `src/server/jobs/cron-auth.ts`: `isAuthorizedCron(request)`:
  - devolve `false` se `CRON_SECRET` não estiver definido;
  - exige `Authorization: Bearer <CRON_SECRET>`;
  - compara em tempo constante (`timingSafeEqual` sobre os hashes SHA-256).
- `src/app/api/cron/outbox/route.ts` e `src/app/api/cron/cleanup/route.ts`:
  - método `GET` (é o que o cron da Vercel usa);
  - sem autorização → `401` com corpo `{ "error": "unauthorized" }`;
  - autorizado → `200` com as contagens em JSON;
  - erro inesperado → `500` com `{ "error": "internal" }` e log de `describeUnexpectedError`;
  - `export const maxDuration = 60`.

**`vercel.json`:**
```json
"crons": [
  { "path": "/api/cron/outbox", "schedule": "0 9 * * *" },
  { "path": "/api/cron/cleanup", "schedule": "30 9 * * *" }
]
```
Os horários são UTC (06:00 e 06:30 em Brasília).

**Variável de ambiente:** `CRON_SECRET` continua opcional em `env.ts`; quando definida, mínimo de 16 caracteres.

## 10. Testes

Vitest contra o Postgres de teste, com os testes escritos antes do código e teste de mutação para cada proteção.

| Área | Casos |
|---|---|
| Schema | As duas tabelas têm `tenant_id`; `dedupe_key` é única por clínica (a mesma chave em clínicas diferentes é aceita) |
| Enfileirar | Grava com a clínica do escopo; `sendAt` padrão é agora; `dedupeKey` repetida devolve a linha existente; canal inválido ou campos vazios são recusados |
| Processar | Só reserva vencidas; sucesso marca `sent`; cada falha aplica a espera da tabela; a 5ª falha vira `failed`; reserva expirada é retomada e reserva vigente não; duas execuções simultâneas não enviam a mesma mensagem; limite de 50; ordem por `send_at`; `last_error` e log sem destinatário |
| Adapters | Cada implementação cumpre a interface; valor desconhecido lança erro com o nome da variável; `console` mascara o destinatário; o código OTP só aparece fora de produção |
| `maskRecipient` | Telefone, e-mail, valores curtos |
| Auditoria | `recordAudit` grava com a clínica do escopo; `safeRecordAudit` não propaga erro; cada ponto de chamada grava a ação, o ator, a entidade e o `metadata` corretos; `metadata` sem senha |
| Limpeza | Cada regra da seção 8, com linhas dentro e fora do prazo; `audit_log` e `failed` intactos |
| Cron | Sem `CRON_SECRET` → 401; cabeçalho ausente ou errado → 401; certo → 200 com contagens; erro no job → 500 sem detalhe |
| Guardas | Lista de imports com `jobs/run.ts`; tabelas novas na guarda de `tenant_id` |

Os testes de ponta a ponta existentes continuam passando; o 0C não acrescenta tela.

## 11. Documentação

- **`.env.example`:** `CRON_SECRET` com o comando para gerar.
- **README:** como chamar os crons localmente; `CRON_SECRET` na Vercel (Production e Preview); a troca do agendamento da fila para `*/5 * * * *` no plano Pro; a migration `0003`.
- **ROADMAP:**
  - marcar "Adapters…", "Tabela `message_outbox` + rota `/api/cron/outbox`" e a parte de `audit_log`;
  - fechar a linha de retenção de `login_attempts`/`sessions`;
  - acrescentar que a fila diária precisa virar "a cada 5 minutos" (Pro) antes da Etapa 4.
- **CLAUDE.md:** sem mudanças.

## 12. Critério de pronto

- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm test:e2e` limpos; `pnpm build` passando.
- Migration aplicada no Docker.
- Localmente, com `pnpm dev`:
  - `GET /api/cron/outbox` sem cabeçalho devolve 401;
  - com o segredo, uma mensagem inserida à mão é entregue ao `console` e fica `sent`.
- Depois de um login e de um cadastro pela tela de equipe, as linhas aparecem no `audit_log`.
- Documentos da seção 11 atualizados.

**Depois do merge, fica com o usuário:**
1. Cadastrar `CRON_SECRET` na Vercel (Production e Preview).
2. Rodar `pnpm db:migrate` em staging e em produção.
