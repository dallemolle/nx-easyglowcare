# Fase 0C: Fila de mensagens, adapters, auditoria e limpeza (plano de implementação)

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** entregar a fila de mensagens com cron, os adapters de serviços externos em modo de desenvolvimento, o registro de auditoria das ações de acesso e de equipe e a limpeza automática de dados antigos.

**Arquitetura:**
- **Núcleo testável:** os jobs (`processOutbox`, `cleanupOldData`) recebem o `db` como parâmetro; os services (`enqueueMessage`, `recordAudit`) recebem um `TenantScope`. Tudo é testado contra o Postgres de teste.
- **Ligação com o app:** um único módulo novo (`src/server/jobs/run.ts`) junta os jobs ao client do app e ao provedor configurado. As rotas de cron só autenticam e chamam esse módulo.
- **Auditoria nos pontos de chamada:** as Server Actions e o `current.ts` registram a ação depois que ela deu certo; uma falha ao auditar nunca desfaz nem quebra a ação.

**Stack:** Next.js 16 (Route Handlers), Drizzle 0.45, Zod 4, Vitest contra Postgres real.

**Spec:** `docs/superpowers/specs/2026-10-02-fase-0c-outbox-audit-design.md`. Leia antes de começar; este plano não repete os motivos das decisões.

## Restrições globais

- Valem as restrições globais dos planos do 0A e do 0B (`docs/superpowers/plans/`): convenções de schema, `tenantScope`, Next 16, pt-BR, commits em português no imperativo com `Co-Authored-By`.
- **Branch:** `feat/fase-0c-outbox-audit`. Não fazer push nem abrir PR: o dono do repositório faz isso à mão.
- **Next 16:** antes de escrever o Route Handler, leia `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` e `02-route-segment-config/maxDuration.md` (regra do `AGENTS.md`).
- **Imports do client:** só `src/server/auth/current.ts`, `src/server/jobs/run.ts` e `src/server/services/tenants.ts` importam `@/server/db/client`.
- **Nunca logar nem gravar em `last_error`/`metadata`:** destinatário completo, payload, senha, senha provisória, token, e-mail completo, CPF. Nunca usar `error.message` em log; usar `describeUnexpectedError` (`src/server/errors.ts`).
- **Fila:** lote de **50**; reserva de **5 minutos**; máximo de **5** tentativas; esperas de **1 min, 5 min, 30 min e 2 h**.
- **Limpeza:** `login_attempts` e `sessions` com mais de **30 dias**; mensagens `sent` com mais de **90 dias**; `audit_log` e mensagens `failed` nunca são apagadas.
- **Cron:** `CRON_SECRET` opcional, mínimo de **16** caracteres quando definido; sem ele as rotas respondem 401. Agendamentos `0 9 * * *` e `30 9 * * *` (plano Hobby só aceita cron diário).
- **Banco:** comandos destrutivos e migrations só contra o Docker local. Antes de `pnpm db:migrate`, confirme que `DATABASE_URL_UNPOOLED` não está definida no shell (o `.env.local` aponta para o Docker).
- **Servidor de dev:** para parar, mate só o PID que escuta a porta 3000. Nunca `taskkill /IM node.exe`.
- **TDD:** teste que falha primeiro, depois o código. Para cada proteção (filtro de status, `SKIP LOCKED`, comparação do segredo, mascaramento), faça o teste de mutação: desligue a proteção, veja o teste falhar, religue.

## Foco de revisão

1. **Duas execuções do cron ao mesmo tempo:** nenhuma mensagem é enviada duas vezes, e a segunda execução não fica esperando a primeira. Testes na Tarefa 4.
2. **Execução que morre no meio:** a mensagem fica `sending` e é retomada depois de 5 minutos, não antes. Teste na Tarefa 4.
3. **Erro do provedor com dado pessoal na mensagem:** `last_error` e o log guardam só o nome do erro. Testes nas Tarefas 2 e 4.
4. **Falha ao auditar:** a ação continua valendo e a senha provisória ainda é devolvida. Testes nas Tarefas 5 e 6.
5. **Rota de cron sem segredo configurado, sem cabeçalho ou com segredo errado:** 401 e o job não roda. Teste na Tarefa 8.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/server/db/schema/messaging.ts` | `messageChannel`, `messageStatus`, `messageOutbox` |
| `src/server/db/schema/audit.ts` | `auditActorType`, `auditLog` |
| `drizzle/0003_outbox_audit.sql` | Migration (só acrescenta) |
| `src/lib/env.ts` | `CRON_SECRET` com mínimo de 16 |
| `src/lib/format.ts` | `maskRecipient` |
| `src/lib/validation/outbox.ts` | `MESSAGE_CHANNELS`, `enqueueMessageSchema` |
| `src/server/adapters/messaging/{types,console,index}.ts` | `MessagingProvider` e implementação `console` |
| `src/server/adapters/payments/{types,mock,index}.ts` | `PaymentProvider` e implementação `mock` |
| `src/server/adapters/signature/{types,internal,index}.ts` | `SignatureProvider` e implementação `internal` |
| `src/server/errors.ts` | Ganha `isUniqueViolation` (sai de `services/staff.ts`) |
| `src/server/services/outbox.ts` | `enqueueMessage` |
| `src/server/services/audit.ts` | `recordAudit`, `safeRecordAudit`, `AuditAction` |
| `src/server/jobs/outbox.ts` | `processOutbox` |
| `src/server/jobs/cleanup.ts` | `cleanupOldData` |
| `src/server/jobs/cron-auth.ts` | `isAuthorizedCron` |
| `src/server/jobs/run.ts` | `runOutboxJob`, `runCleanupJob` (único que importa o client) |
| `src/app/api/cron/{outbox,cleanup}/route.ts` | Rotas `GET` do cron |
| `src/server/auth/{login,current}.ts`, `src/server/services/staff.ts`, actions de `equipe` e `trocar-senha`, `src/server/db/staff-create.ts` | Chamadas de auditoria |
| `vercel.json`, `.env.example`, `README.md`, `ROADMAP.md` | Agendamento e documentação |

---

### Task 1: schema, migration e variável do cron

**Arquivos:**
- Criar: `src/server/db/schema/messaging.ts`, `src/server/db/schema/audit.ts`, `src/lib/validation/outbox.ts`, `drizzle/0003_outbox_audit.sql` (gerado)
- Modificar: `src/server/db/schema/index.ts`, `src/server/db/schema.test.ts`, `src/lib/env.ts`, `src/lib/env.test.ts`

**Interfaces:**
- Produz:
  - `messageChannel` (pgEnum `message_channel`), `messageStatus` (pgEnum `message_status`), `messageOutbox`, `type MessageOutbox`
  - `auditActorType` (pgEnum `audit_actor_type`), `auditLog`, `type AuditLogEntry`
  - `MESSAGE_CHANNELS = ["whatsapp", "sms", "email", "push"] as const`, `type MessageChannel`, `messageChannelSchema`
  - `getEnv().CRON_SECRET: string | undefined` (mínimo de 16 quando definido)

- [ ] **Passo 1: testes que falham**

Em `src/lib/env.test.ts`, dentro do `describe("getEnv")`:
```ts
it("CRON_SECRET é opcional e vazio conta como ausente", () => {
  expect(getEnv(base).CRON_SECRET).toBeUndefined();
  expect(getEnv({ ...base, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
});

it("rejeita CRON_SECRET com menos de 16 caracteres", () => {
  expect(() => getEnv({ ...base, CRON_SECRET: "x".repeat(15) })).toThrow(/CRON_SECRET/);
});

it("aceita CRON_SECRET com 16 caracteres", () => {
  expect(getEnv({ ...base, CRON_SECRET: "x".repeat(16) }).CRON_SECRET).toHaveLength(16);
});
```

Em `src/server/db/schema.test.ts`:
- No primeiro teste, troque `toBeGreaterThanOrEqual(6)` por `toBeGreaterThanOrEqual(10)` (as tabelas novas entram sozinhas na guarda de `tenant_id`).
- No `describe("guardas do schema")`:
```ts
it("os canais do Zod e do enum do banco são os mesmos", () => {
  expect(schema.messageChannel.enumValues).toEqual([...MESSAGE_CHANNELS]);
});

it("audit_log não tem updated_at", () => {
  const config = getTableConfig(schema.auditLog);
  expect(config.columns.map((c) => toSnakeCase(c.name))).not.toContain("updated_at");
});
```
  com `import { MESSAGE_CHANNELS } from "@/lib/validation/outbox";` no topo.
- No `describe("restrições no banco")`:
```ts
const OUTBOX_INSERT = `insert into message_outbox (tenant_id, channel, template, recipient, send_at, dedupe_key)
  values ($1, 'whatsapp', 'teste', '11999990000', now(), $2)`;

it("dedupe_key é única por clínica", async () => {
  const tenantA = await insertTenant("clinica-a");
  await testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"]);
  await expect(testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"])).rejects.toThrow(/unique/);
});

it("a mesma dedupe_key em clínicas diferentes é aceita, e nula pode repetir", async () => {
  const tenantA = await insertTenant("clinica-a");
  const tenantB = await insertTenant("clinica-b");
  await testPool.query(OUTBOX_INSERT, [tenantA, "chave-1"]);
  await testPool.query(OUTBOX_INSERT, [tenantB, "chave-1"]);
  await testPool.query(OUTBOX_INSERT, [tenantA, null]);
  await testPool.query(OUTBOX_INSERT, [tenantA, null]);
  const { rows } = await testPool.query("select id from message_outbox");
  expect(rows).toHaveLength(4);
});

it("mensagem nasce pending, com 0 tentativas e payload vazio", async () => {
  const tenantA = await insertTenant("clinica-a");
  await testPool.query(OUTBOX_INSERT, [tenantA, null]);
  const { rows } = await testPool.query("select status, attempts, payload from message_outbox");
  expect(rows[0]).toEqual({ status: "pending", attempts: 0, payload: {} });
});
```

- [ ] **Passo 2:** `pnpm test` → falha (módulos e tabelas não existem; `CRON_SECRET` curto é aceito).

- [ ] **Passo 3: implementar**

`src/lib/validation/outbox.ts` (o schema de enfileirar entra na Tarefa 3):
```ts
import { z } from "zod";

export const MESSAGE_CHANNELS = ["whatsapp", "sms", "email", "push"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const messageChannelSchema = z.enum(MESSAGE_CHANNELS);
```

`src/server/db/schema/messaging.ts`:
```ts
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { tenantColumns } from "./tenancy";

// Mesma lista de MESSAGE_CHANNELS (src/lib/validation/outbox.ts); um teste garante a igualdade.
export const messageChannel = pgEnum("message_channel", ["whatsapp", "sms", "email", "push"]);
export const messageStatus = pgEnum("message_status", ["pending", "sending", "sent", "failed"]);

export const messageOutbox = pgTable(
  "message_outbox",
  {
    ...tenantColumns(),
    channel: messageChannel().notNull(),
    template: text().notNull(),
    recipient: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sendAt: timestamp({ withTimezone: true }).notNull(),
    status: messageStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    // Só o tipo do erro (nome e código): a mensagem do provedor pode trazer o destinatário.
    lastError: text(),
    dedupeKey: text(),
    sentAt: timestamp({ withTimezone: true }),
    providerMessageId: text(),
  },
  (t) => [
    index().on(t.tenantId),
    unique().on(t.tenantId, t.id),
    unique().on(t.tenantId, t.dedupeKey),
    index().on(t.status, t.sendAt),
  ],
);

export type MessageOutbox = typeof messageOutbox.$inferSelect;
```

`src/server/db/schema/audit.ts`:
```ts
import { index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { tenants } from "./tenancy";

export const auditActorType = pgEnum("audit_actor_type", ["staff", "system"]);

// Sem updatedAt: um registro de auditoria nunca é atualizado.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: auditActorType().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: uuid(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: text(),
  },
  (t) => [index().on(t.tenantId, t.createdAt), unique().on(t.tenantId, t.id)],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
```

`src/server/db/schema/index.ts`: acrescentar `export * from "./audit";` e `export * from "./messaging";` (ordem alfabética).

`src/lib/env.ts`: trocar a linha de `CRON_SECRET` por
```ts
  CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
```

- [ ] **Passo 4: migration**

```bash
pnpm db:generate --name outbox_audit
```
Confira `drizzle/0003_outbox_audit.sql`: três `CREATE TYPE`, duas `CREATE TABLE`, FKs para `tenants` com `ON DELETE cascade`, `UNIQUE(tenant_id, dedupe_key)`, índice `(status, send_at)` e índice `(tenant_id, created_at)`. Nenhum `ALTER`/`DROP` em tabela existente. Depois:
```bash
pnpm db:migrate
```

- [ ] **Passo 5:** `pnpm test && pnpm typecheck && pnpm lint` → limpo.
- [ ] **Passo 6: commit** "Adiciona tabelas message_outbox e audit_log".

---

### Task 2: mascaramento e adapters

**Arquivos:**
- Modificar: `src/lib/format.ts`, `src/lib/format.test.ts`
- Criar: `src/server/adapters/messaging/{types,console,index}.ts`, `src/server/adapters/payments/{types,mock,index}.ts`, `src/server/adapters/signature/{types,internal,index}.ts`
- Testar: `src/server/adapters/messaging/messaging.test.ts`, `src/server/adapters/payments/payments.test.ts`, `src/server/adapters/signature/signature.test.ts`

**Interfaces:**
- Consome: `MessageChannel` (`@/lib/validation/outbox`), `getEnv()`.
- Produz:
  - `maskRecipient(recipient: string): string`
  - `MessagingProvider`, `SendOtpInput`, `SendTemplateInput`, `SendResult`, `getMessagingProvider(name?: string): MessagingProvider`
  - `PaymentProvider` e tipos, `PaymentWebhookError`, `getPaymentProvider(name?: string): PaymentProvider`
  - `SignatureProvider` e tipos, `getSignatureProvider(name?: string): SignatureProvider`

- [ ] **Passo 1: testes que falham**

Em `src/lib/format.test.ts`:
```ts
describe("maskRecipient", () => {
  it("telefone: mostra só os 4 últimos dígitos", () => {
    expect(maskRecipient("11987651234")).toBe("*******1234");
    expect(maskRecipient("+55 (11) 98765-1234")).toBe("*********1234");
  });

  it("e-mail: primeira letra e domínio", () => {
    expect(maskRecipient("marina@exemplo.com")).toBe("m***@exemplo.com");
  });

  it("valores curtos ou desconhecidos ficam totalmente ocultos", () => {
    expect(maskRecipient("1234")).toBe("****");
    expect(maskRecipient("12")).toBe("****");
    expect(maskRecipient("")).toBe("****");
    expect(maskRecipient("@exemplo.com")).toBe("****");
    expect(maskRecipient("assinatura-push-abc")).toBe("****");
  });
});
```

`src/server/adapters/messaging/messaging.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consoleMessagingProvider } from "./console";
import { getMessagingProvider } from "./index";

describe("getMessagingProvider", () => {
  it("devolve o console por padrão e por nome", () => {
    expect(getMessagingProvider()).toBe(consoleMessagingProvider);
    expect(getMessagingProvider("console").name).toBe("console");
  });

  it("valor desconhecido lança erro com o nome da variável", () => {
    expect(() => getMessagingProvider("twilio")).toThrow(/MESSAGING_PROVIDER/);
  });
});

describe("consoleMessagingProvider", () => {
  let info: ReturnType<typeof vi.spyOn>;
  const logged = () => info.mock.calls.flat().map(String).join(" ");

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    info.mockRestore();
  });

  it("sendTemplate loga canal, modelo e destinatário mascarado, sem o payload", async () => {
    const result = await consoleMessagingProvider.sendTemplate({
      channel: "whatsapp",
      recipient: "11987651234",
      template: "appointment.reminder_24h",
      payload: { nome: "Marina Segredo" },
    });

    expect(result.providerMessageId).toMatch(/^console-/);
    expect(logged()).toContain("whatsapp");
    expect(logged()).toContain("appointment.reminder_24h");
    expect(logged()).toContain("*******1234");
    expect(logged()).not.toContain("11987651234");
    expect(logged()).not.toContain("Marina Segredo");
  });

  it("sendOtp mostra o código fora de produção", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await consoleMessagingProvider.sendOtp({ channel: "sms", recipient: "11987651234", code: "482913" });
    expect(logged()).toContain("482913");
    expect(logged()).not.toContain("11987651234");
  });

  it("sendOtp nunca mostra o código em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await consoleMessagingProvider.sendOtp({ channel: "sms", recipient: "11987651234", code: "482913" });
    expect(logged()).not.toContain("482913");
  });

  it("cada envio devolve um id diferente", async () => {
    const input = { channel: "email" as const, recipient: "m@x.test", template: "t", payload: {} };
    const a = await consoleMessagingProvider.sendTemplate(input);
    const b = await consoleMessagingProvider.sendTemplate(input);
    expect(a.providerMessageId).not.toBe(b.providerMessageId);
  });
});
```

`src/server/adapters/payments/payments.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { getPaymentProvider } from "./index";
import { mockPaymentProvider } from "./mock";
import { PaymentWebhookError } from "./types";

const EXPIRES = new Date("2026-10-03T12:00:00Z");
const pix = { amountCents: 5000, description: "Sinal", reference: "pedido-1", expiresAt: EXPIRES };

describe("getPaymentProvider", () => {
  it("devolve o mock por padrão; valor desconhecido cita a variável", () => {
    expect(getPaymentProvider()).toBe(mockPaymentProvider);
    expect(() => getPaymentProvider("asaas")).toThrow(/PAYMENT_PROVIDER/);
  });
});

describe("mockPaymentProvider", () => {
  it("createPixCharge é determinístico a partir da entrada", async () => {
    const a = await mockPaymentProvider.createPixCharge(pix);
    const b = await mockPaymentProvider.createPixCharge(pix);
    const other = await mockPaymentProvider.createPixCharge({ ...pix, reference: "pedido-2" });

    expect(a).toEqual(b);
    expect(a.status).toBe("pending");
    expect(a.expiresAt).toEqual(EXPIRES);
    expect(a.pixCopyPaste).toContain(a.providerChargeId);
    expect(other.providerChargeId).not.toBe(a.providerChargeId);
  });

  it("createCardCharge devolve cobrança paga e determinística", async () => {
    const input = {
      amountCents: 30000,
      description: "Pacote",
      reference: "pedido-3",
      installments: 3,
      cardToken: "tok_teste",
    };
    const a = await mockPaymentProvider.createCardCharge(input);
    expect(a).toEqual(await mockPaymentProvider.createCardCharge(input));
    expect(a.status).toBe("paid");
  });

  it("refund devolve o estorno da cobrança informada", async () => {
    const refund = await mockPaymentProvider.refund({ providerChargeId: "mock_ch_abc" });
    expect(refund).toEqual({ providerRefundId: "mock_re_abc", status: "refunded" });
  });

  it("parseWebhook lê o evento do corpo JSON", async () => {
    const event = await mockPaymentProvider.parseWebhook({
      headers: new Headers(),
      body: JSON.stringify({ eventId: "evt_1", type: "charge.paid", chargeId: "mock_ch_abc" }),
    });
    expect(event).toEqual({
      providerEventId: "evt_1",
      type: "charge.paid",
      providerChargeId: "mock_ch_abc",
    });
  });

  it.each([["não é json"], [JSON.stringify({ eventId: "evt_1" })], [JSON.stringify({ eventId: "e", type: "x", chargeId: "c" })]])(
    "parseWebhook recusa corpo inválido (%s)",
    async (body) => {
      await expect(
        mockPaymentProvider.parseWebhook({ headers: new Headers(), body }),
      ).rejects.toBeInstanceOf(PaymentWebhookError);
    },
  );
});
```

`src/server/adapters/signature/signature.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { getSignatureProvider } from "./index";
import { internalSignatureProvider } from "./internal";

describe("getSignatureProvider", () => {
  it("devolve o interno por padrão; valor desconhecido cita a variável", () => {
    expect(getSignatureProvider()).toBe(internalSignatureProvider);
    expect(() => getSignatureProvider("zapsign")).toThrow(/SIGNATURE_PROVIDER/);
  });
});

describe("internalSignatureProvider", () => {
  it("o aceite eletrônico já nasce assinado", async () => {
    const request = await internalSignatureProvider.requestSignature({
      documentId: "termo-v1",
      signerName: "Marina Alves",
      reference: "aceite-1",
    });

    expect(request).toEqual({ providerSignatureId: "internal-aceite-1", status: "signed" });
    expect(await internalSignatureProvider.getStatus(request.providerSignatureId)).toBe("signed");
  });
});
```

- [ ] **Passo 2:** `pnpm test` → falha (módulos não existem).

- [ ] **Passo 3: implementar**

Em `src/lib/format.ts`, ao final:
```ts
/**
 * Destinatário para log: telefone mostra só os 4 últimos dígitos; e-mail, a primeira letra e o
 * domínio. Qualquer outro valor (curto, vazio, assinatura de push) fica totalmente oculto.
 */
export function maskRecipient(recipient: string): string {
  const at = recipient.lastIndexOf("@");
  if (at > 0) return `${recipient[0]}***${recipient.slice(at)}`;
  if (at === 0) return "****";

  const digits = recipient.replace(/\D/g, "");
  const looksLikePhone = digits.length > 4 && /^[\d\s()+-]+$/.test(recipient);
  if (!looksLikePhone) return "****";
  return "*".repeat(digits.length - 4) + digits.slice(-4);
}
```

`src/server/adapters/messaging/types.ts`:
```ts
import type { MessageChannel } from "@/lib/validation/outbox";

export type SendResult = { providerMessageId: string };

export type SendOtpInput = { channel: MessageChannel; recipient: string; code: string };

export type SendTemplateInput = {
  channel: MessageChannel;
  recipient: string;
  template: string;
  payload: Record<string, unknown>;
};

export interface MessagingProvider {
  readonly name: string;
  /** Código de verificação: chamado direto (fora da fila), porque quem faz login não pode esperar o cron. */
  sendOtp(input: SendOtpInput): Promise<SendResult>;
  /** Mensagem de modelo: só o processador da fila chama. */
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
}
```

`src/server/adapters/messaging/console.ts`:
```ts
import "server-only";

import { randomUUID } from "node:crypto";

import { maskRecipient } from "@/lib/format";

import type { MessagingProvider } from "./types";

/** Implementação de desenvolvimento: "envia" imprimindo no terminal, sem dado pessoal. */
export const consoleMessagingProvider: MessagingProvider = {
  name: "console",

  async sendOtp({ channel, recipient, code }) {
    // Em dev o terminal É o canal de entrega do código; em produção ele nunca é impresso.
    const shown = process.env.NODE_ENV === "production" ? "[oculto]" : code;
    console.info(
      `[messaging:console] otp canal=${channel} para=${maskRecipient(recipient)} codigo=${shown}`,
    );
    return { providerMessageId: `console-${randomUUID()}` };
  },

  async sendTemplate({ channel, recipient, template }) {
    console.info(
      `[messaging:console] modelo=${template} canal=${channel} para=${maskRecipient(recipient)}`,
    );
    return { providerMessageId: `console-${randomUUID()}` };
  },
};
```

`src/server/adapters/messaging/index.ts`:
```ts
import "server-only";

import { getEnv } from "@/lib/env";

import { consoleMessagingProvider } from "./console";
import type { MessagingProvider } from "./types";

export type { MessagingProvider, SendOtpInput, SendResult, SendTemplateInput } from "./types";

export function getMessagingProvider(name: string = getEnv().MESSAGING_PROVIDER): MessagingProvider {
  switch (name) {
    case "console":
      return consoleMessagingProvider;
    default:
      throw new Error(`MESSAGING_PROVIDER desconhecido: ${name}`);
  }
}
```

`src/server/adapters/payments/types.ts`:
```ts
export type ChargeStatus = "pending" | "paid" | "refunded" | "failed";

export type CreatePixChargeInput = {
  amountCents: number;
  description: string;
  /** Identificador do pedido no nosso sistema; torna a cobrança idempotente. */
  reference: string;
  expiresAt: Date;
};

export type PixCharge = {
  providerChargeId: string;
  status: ChargeStatus;
  pixCopyPaste: string;
  expiresAt: Date;
};

export type CreateCardChargeInput = {
  amountCents: number;
  description: string;
  reference: string;
  installments: number;
  cardToken: string;
};

export type CardCharge = { providerChargeId: string; status: ChargeStatus };

export type RefundInput = { providerChargeId: string; amountCents?: number };

export type Refund = { providerRefundId: string; status: "refunded" };

export type PaymentWebhookEvent = {
  providerEventId: string;
  type: "charge.paid" | "charge.refunded" | "charge.failed";
  providerChargeId: string;
};

export class PaymentWebhookError extends Error {
  constructor() {
    super("Webhook de pagamento inválido.");
    this.name = "PaymentWebhookError";
  }
}

export interface PaymentProvider {
  readonly name: string;
  createPixCharge(input: CreatePixChargeInput): Promise<PixCharge>;
  createCardCharge(input: CreateCardChargeInput): Promise<CardCharge>;
  refund(input: RefundInput): Promise<Refund>;
  /** Valida a assinatura do provedor e devolve o evento; lança `PaymentWebhookError` se inválido. */
  parseWebhook(request: { headers: Headers; body: string }): Promise<PaymentWebhookEvent>;
}
```

`src/server/adapters/payments/mock.ts`:
```ts
import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { PaymentWebhookError, type PaymentProvider } from "./types";

function fakeId(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

const webhookSchema = z.object({
  eventId: z.string().min(1),
  type: z.enum(["charge.paid", "charge.refunded", "charge.failed"]),
  chargeId: z.string().min(1),
});

/** Implementação de desenvolvimento: respostas falsas e determinísticas, sem rede. */
export const mockPaymentProvider: PaymentProvider = {
  name: "mock",

  async createPixCharge({ amountCents, reference, expiresAt }) {
    const providerChargeId = fakeId("mock_ch", "pix", reference, amountCents);
    return {
      providerChargeId,
      status: "pending",
      pixCopyPaste: `00020126MOCK${providerChargeId}`,
      expiresAt,
    };
  },

  async createCardCharge({ amountCents, reference, installments }) {
    return {
      providerChargeId: fakeId("mock_ch", "card", reference, amountCents, installments),
      status: "paid",
    };
  },

  async refund({ providerChargeId }) {
    return { providerRefundId: providerChargeId.replace(/^mock_ch_/, "mock_re_"), status: "refunded" };
  },

  async parseWebhook({ body }) {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new PaymentWebhookError();
    }
    const parsed = webhookSchema.safeParse(json);
    if (!parsed.success) throw new PaymentWebhookError();
    return {
      providerEventId: parsed.data.eventId,
      type: parsed.data.type,
      providerChargeId: parsed.data.chargeId,
    };
  },
};
```

`src/server/adapters/payments/index.ts`:
```ts
import "server-only";

import { getEnv } from "@/lib/env";

import { mockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

export * from "./types";

export function getPaymentProvider(name: string = getEnv().PAYMENT_PROVIDER): PaymentProvider {
  switch (name) {
    case "mock":
      return mockPaymentProvider;
    default:
      throw new Error(`PAYMENT_PROVIDER desconhecido: ${name}`);
  }
}
```

`src/server/adapters/signature/types.ts`:
```ts
export type SignatureStatus = "pending" | "signed" | "declined";

export type RequestSignatureInput = {
  documentId: string;
  signerName: string;
  /** Identificador do aceite no nosso sistema. */
  reference: string;
};

export type SignatureRequest = { providerSignatureId: string; status: SignatureStatus };

export interface SignatureProvider {
  readonly name: string;
  requestSignature(input: RequestSignatureInput): Promise<SignatureRequest>;
  getStatus(providerSignatureId: string): Promise<SignatureStatus>;
}
```

`src/server/adapters/signature/internal.ts`:
```ts
import "server-only";

import type { SignatureProvider } from "./types";

/**
 * Aceite eletrônico interno: a pessoa aceita o termo na própria tela, então o pedido já
 * nasce assinado. O registro do aceite (versão, data, IP) é responsabilidade de quem chama.
 */
export const internalSignatureProvider: SignatureProvider = {
  name: "internal",

  async requestSignature({ reference }) {
    return { providerSignatureId: `internal-${reference}`, status: "signed" };
  },

  async getStatus() {
    return "signed";
  },
};
```

`src/server/adapters/signature/index.ts`:
```ts
import "server-only";

import { getEnv } from "@/lib/env";

import { internalSignatureProvider } from "./internal";
import type { SignatureProvider } from "./types";

export * from "./types";

export function getSignatureProvider(name: string = getEnv().SIGNATURE_PROVIDER): SignatureProvider {
  switch (name) {
    case "internal":
      return internalSignatureProvider;
    default:
      throw new Error(`SIGNATURE_PROVIDER desconhecido: ${name}`);
  }
}
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint` → limpo. Mutação: em `console.ts`, troque `maskRecipient(recipient)` por `recipient` e veja o teste falhar; desfaça.
- [ ] **Passo 5: commit** "Adiciona adapters de mensagens, pagamento e assinatura em modo de desenvolvimento".

---

### Task 3: enfileirar mensagem

**Arquivos:**
- Modificar: `src/lib/validation/outbox.ts`, `src/server/errors.ts`, `src/server/services/staff.ts`
- Criar: `src/server/services/outbox.ts`
- Testar: `src/server/services/outbox.test.ts`, `src/server/errors.test.ts`

**Interfaces:**
- Consome: `TenantScope`, `messageOutbox`, `MessageOutbox`, `MESSAGE_CHANNELS`.
- Produz:
  - `isUniqueViolation(error: unknown): boolean` em `src/server/errors.ts`
  - `enqueueMessageSchema`, `type EnqueueMessageInput` (`z.input` do schema)
  - `class OutboxError extends Error`
  - `enqueueMessage(scope: TenantScope, input: EnqueueMessageInput, now?: Date): Promise<MessageOutbox>`

- [ ] **Passo 1: testes que falham**

`src/server/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("reconhece o código 23505 direto ou na causa", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error("x"), { cause: { code: "23505" } }))).toBe(true);
  });

  it("recusa outros erros e valores", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
  });
});
```

`src/server/services/outbox.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { messageOutbox, tenants, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import { enqueueMessage, OutboxError } from "./outbox";

const db = getTestDb();
const NOW = new Date("2026-10-02T12:00:00Z");
const base = { channel: "whatsapp", template: "appointment.reminder_24h", recipient: "11987651234" } as const;

let tenantA: Tenant;
let tenantB: Tenant;
let scopeA: TenantScope;
let scopeB: TenantScope;

beforeEach(async () => {
  await resetDb();
  [tenantA] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [tenantB] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
  scopeA = tenantScope(db, tenantA.id);
  scopeB = tenantScope(db, tenantB.id);
});

describe("enqueueMessage", () => {
  it("grava com a clínica do escopo, pending, e send_at padrão = agora", async () => {
    const message = await enqueueMessage(scopeA, base, NOW);

    expect(message.tenantId).toBe(tenantA.id);
    expect(message.status).toBe("pending");
    expect(message.attempts).toBe(0);
    expect(message.sendAt).toEqual(NOW);
    expect(message.payload).toEqual({});
    expect(message.dedupeKey).toBeNull();
  });

  it("respeita sendAt e payload informados", async () => {
    const sendAt = new Date("2026-10-03T09:00:00Z");
    const message = await enqueueMessage(scopeA, { ...base, sendAt, payload: { hora: "09:00" } }, NOW);

    expect(message.sendAt).toEqual(sendAt);
    expect(message.payload).toEqual({ hora: "09:00" });
  });

  it("dedupeKey repetida na mesma clínica devolve a linha existente, sem criar outra", async () => {
    const first = await enqueueMessage(scopeA, { ...base, dedupeKey: "lembrete-1" }, NOW);
    const second = await enqueueMessage(scopeA, { ...base, template: "outro", dedupeKey: "lembrete-1" }, NOW);

    expect(second.id).toBe(first.id);
    expect(second.template).toBe(base.template);
    expect(await db.select().from(messageOutbox)).toHaveLength(1);
  });

  it("a mesma dedupeKey em outra clínica cria outra mensagem", async () => {
    const a = await enqueueMessage(scopeA, { ...base, dedupeKey: "lembrete-1" }, NOW);
    const b = await enqueueMessage(scopeB, { ...base, dedupeKey: "lembrete-1" }, NOW);

    expect(b.id).not.toBe(a.id);
    expect(b.tenantId).toBe(tenantB.id);
  });

  it("sem dedupeKey, mensagens iguais são enfileiradas duas vezes", async () => {
    await enqueueMessage(scopeA, base, NOW);
    await enqueueMessage(scopeA, base, NOW);
    expect(await db.select().from(messageOutbox)).toHaveLength(2);
  });

  it.each([
    ["canal inválido", { ...base, channel: "telegram" }],
    ["modelo vazio", { ...base, template: "  " }],
    ["destinatário vazio", { ...base, recipient: "" }],
    ["dedupeKey vazia", { ...base, dedupeKey: "" }],
  ])("recusa %s com OutboxError, sem gravar", async (_name, input) => {
    await expect(enqueueMessage(scopeA, input as never, NOW)).rejects.toBeInstanceOf(OutboxError);
    expect(await db.select().from(messageOutbox)).toHaveLength(0);
  });

  it("a mensagem do OutboxError não carrega o destinatário", async () => {
    const error = await enqueueMessage(scopeA, { ...base, channel: "telegram" } as never, NOW).catch(
      (e: unknown) => e,
    );
    expect(String((error as Error).message)).not.toContain(base.recipient);
  });
});
```

- [ ] **Passo 2:** `pnpm test` → falha.

- [ ] **Passo 3: implementar**

Em `src/server/errors.ts`, acrescentar (movendo de `services/staff.ts`, que passa a importar daqui e perde a cópia local):
```ts
/**
 * Violação de unicidade do Postgres. No Drizzle 0.45 o erro do driver pode vir embrulhado:
 * o código aparece em `error.code` ou em `error.cause.code`.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return Boolean(cause && typeof cause === "object" && (cause as { code?: unknown }).code === "23505");
}
```
Em `src/server/services/staff.ts`: apagar a função local `isUniqueViolation` e acrescentar `import { isUniqueViolation } from "@/server/errors";`.

Em `src/lib/validation/outbox.ts`, acrescentar:
```ts
export const enqueueMessageSchema = z.object({
  channel: messageChannelSchema,
  template: z.string().trim().min(1).max(100),
  recipient: z.string().trim().min(1).max(254),
  payload: z.record(z.string(), z.unknown()).default({}),
  sendAt: z.date().optional(),
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});

export type EnqueueMessageInput = z.input<typeof enqueueMessageSchema>;
```

`src/server/services/outbox.ts`:
```ts
import "server-only";

import { eq } from "drizzle-orm";

import { enqueueMessageSchema, type EnqueueMessageInput } from "@/lib/validation/outbox";
import { messageOutbox, type MessageOutbox } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";
import { isUniqueViolation } from "@/server/errors";

export class OutboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxError";
  }
}

/**
 * Enfileira uma mensagem para o cron enviar (nada é enviado na hora). Com `dedupeKey`
 * repetida na mesma clínica, não cria segunda linha: devolve a que já existe.
 */
export async function enqueueMessage(
  scope: TenantScope,
  input: EnqueueMessageInput,
  now: Date = new Date(),
): Promise<MessageOutbox> {
  const parsed = enqueueMessageSchema.safeParse(input);
  if (!parsed.success) {
    // Só o nome dos campos: a mensagem do Zod pode ecoar o valor (o destinatário).
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new OutboxError(`Mensagem inválida: ${fields}`);
  }
  const { channel, template, recipient, payload, sendAt, dedupeKey } = parsed.data;

  try {
    const [message] = await scope.insert(messageOutbox, {
      channel,
      template,
      recipient,
      payload,
      sendAt: sendAt ?? now,
      dedupeKey,
    });
    return message;
  } catch (error) {
    if (!dedupeKey || !isUniqueViolation(error)) throw error;
    const [existing] = await scope.select(messageOutbox, eq(messageOutbox.dedupeKey, dedupeKey));
    if (!existing) throw error;
    return existing;
  }
}
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint` → limpo (inclusive os testes existentes de `staff`, que cobrem o e-mail duplicado).
- [ ] **Passo 5: commit** "Adiciona enqueueMessage com chave de deduplicação".

---

### Task 4: processador da fila

**Arquivos:**
- Criar: `src/server/jobs/outbox.ts`
- Testar: `src/server/jobs/outbox.test.ts`

**Interfaces:**
- Consome: `messageOutbox`, `MessageOutbox`, `AnyPgDatabase`, `MessagingProvider`, `describeUnexpectedError`.
- Produz:
  - `OUTBOX_BATCH_SIZE = 50`, `OUTBOX_MAX_ATTEMPTS = 5`, `OUTBOX_LEASE_MS` (5 min), `OUTBOX_RETRY_DELAYS_MS` (`[1 min, 5 min, 30 min, 2 h]`)
  - `type OutboxRunResult = { claimed: number; sent: number; retried: number; failed: number }`
  - `processOutbox(db: AnyPgDatabase, provider: Pick<MessagingProvider, "sendTemplate">, now?: Date): Promise<OutboxRunResult>`

- [ ] **Passo 1: testes que falham**

`src/server/jobs/outbox.test.ts`:
```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb, testPool } from "../../../test/db";
import type { MessagingProvider, SendTemplateInput } from "../adapters/messaging/types";
import { messageOutbox, tenants, type MessageOutbox, type Tenant } from "../db/schema";

import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_MS,
  OUTBOX_RETRY_DELAYS_MS,
  processOutbox,
} from "./outbox";

const db = getTestDb();
const NOW = new Date("2026-10-02T12:00:00Z");
const MINUTE = 60_000;
const RECIPIENT = "11987651234";

type Provider = Pick<MessagingProvider, "sendTemplate">;

class ProviderDown extends Error {
  constructor(recipient: string) {
    super(`falha ao enviar para ${recipient}`);
    this.name = "ProviderDown";
  }
}

function recordingProvider(delayMs = 0) {
  const calls: SendTemplateInput[] = [];
  const provider: Provider = {
    async sendTemplate(input) {
      calls.push(input);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { providerMessageId: `fake-${calls.length}` };
    },
  };
  return { provider, calls };
}

const failingProvider: Provider = {
  async sendTemplate(input) {
    throw new ProviderDown(input.recipient);
  },
};

let tenant: Tenant;
let info: ReturnType<typeof vi.spyOn>;

async function insertMessage(values: Partial<typeof messageOutbox.$inferInsert> = {}): Promise<MessageOutbox> {
  const [row] = await db
    .insert(messageOutbox)
    .values({
      tenantId: tenant.id,
      channel: "whatsapp",
      template: "appointment.reminder_24h",
      recipient: RECIPIENT,
      sendAt: NOW,
      ...values,
    })
    .returning();
  return row;
}

async function reload(id: string): Promise<MessageOutbox> {
  const [row] = await db.select().from(messageOutbox).where(eq(messageOutbox.id, id));
  return row;
}

beforeEach(async () => {
  await resetDb();
  [tenant] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  info.mockRestore();
});

describe("processOutbox: o que é reservado", () => {
  it("envia a mensagem vencida e marca como sent", async () => {
    const message = await insertMessage({ payload: { hora: "09:00" } });
    const { provider, calls } = recordingProvider();

    const result = await processOutbox(db, provider, NOW);

    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(calls).toEqual([
      {
        channel: "whatsapp",
        recipient: RECIPIENT,
        template: "appointment.reminder_24h",
        payload: { hora: "09:00" },
      },
    ]);
    const row = await reload(message.id);
    expect(row.status).toBe("sent");
    expect(row.sentAt).toEqual(NOW);
    expect(row.providerMessageId).toBe("fake-1");
    expect(row.attempts).toBe(1);
    expect(row.lockedUntil).toBeNull();
    expect(row.lastError).toBeNull();
  });

  it("não envia mensagem com send_at no futuro", async () => {
    const message = await insertMessage({ sendAt: new Date(NOW.getTime() + 1) });
    const { provider, calls } = recordingProvider();

    expect(await processOutbox(db, provider, NOW)).toEqual({ claimed: 0, sent: 0, retried: 0, failed: 0 });
    expect(calls).toHaveLength(0);
    expect((await reload(message.id)).status).toBe("pending");
  });

  it.each(["sent", "failed"] as const)("não reenvia mensagem %s", async (status) => {
    await insertMessage({ status });
    const { provider, calls } = recordingProvider();

    expect((await processOutbox(db, provider, NOW)).claimed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("reserva vigente (sending com locked_until no futuro) não é retomada", async () => {
    await insertMessage({ status: "sending", attempts: 1, lockedUntil: new Date(NOW.getTime() + 1) });
    const { provider, calls } = recordingProvider();

    expect((await processOutbox(db, provider, NOW)).claimed).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("reserva expirada é retomada e conta mais uma tentativa", async () => {
    const message = await insertMessage({
      status: "sending",
      attempts: 1,
      lockedUntil: new Date(NOW.getTime() - 1),
    });
    const { provider, calls } = recordingProvider();

    expect((await processOutbox(db, provider, NOW)).sent).toBe(1);
    expect(calls).toHaveLength(1);
    const row = await reload(message.id);
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(2);
  });

  it("reserva no máximo 50 por execução e o resto na seguinte", async () => {
    await db.insert(messageOutbox).values(
      Array.from({ length: OUTBOX_BATCH_SIZE + 10 }, (_, i) => ({
        tenantId: tenant.id,
        channel: "sms" as const,
        template: "t",
        recipient: RECIPIENT,
        sendAt: new Date(NOW.getTime() - i * 1000),
      })),
    );
    const { provider } = recordingProvider();

    expect((await processOutbox(db, provider, NOW)).claimed).toBe(50);
    expect((await processOutbox(db, provider, NOW)).claimed).toBe(10);
    expect((await processOutbox(db, provider, NOW)).claimed).toBe(0);
  });

  it("envia em ordem de send_at", async () => {
    await insertMessage({ template: "terceira", sendAt: new Date(NOW.getTime() - 1 * MINUTE) });
    await insertMessage({ template: "primeira", sendAt: new Date(NOW.getTime() - 3 * MINUTE) });
    await insertMessage({ template: "segunda", sendAt: new Date(NOW.getTime() - 2 * MINUTE) });
    const { provider, calls } = recordingProvider();

    await processOutbox(db, provider, NOW);

    expect(calls.map((call) => call.template)).toEqual(["primeira", "segunda", "terceira"]);
  });

  it("processa mensagens de todas as clínicas", async () => {
    const [other] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
    await insertMessage();
    await insertMessage({ tenantId: other.id });
    const { provider } = recordingProvider();

    expect((await processOutbox(db, provider, NOW)).sent).toBe(2);
  });
});

describe("processOutbox: falhas e novas tentativas", () => {
  it("cada falha aplica a espera da tabela e a 5ª vira failed", async () => {
    const message = await insertMessage();
    let now = NOW;

    for (const [index, delay] of OUTBOX_RETRY_DELAYS_MS.entries()) {
      const result = await processOutbox(db, failingProvider, now);
      expect(result).toEqual({ claimed: 1, sent: 0, retried: 1, failed: 0 });

      const row = await reload(message.id);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(index + 1);
      expect(row.sendAt).toEqual(new Date(now.getTime() + delay));
      expect(row.lockedUntil).toBeNull();

      // Um instante antes da espera terminar, ainda não é reservada.
      expect((await processOutbox(db, failingProvider, new Date(row.sendAt.getTime() - 1))).claimed).toBe(0);
      now = row.sendAt;
    }

    expect(OUTBOX_RETRY_DELAYS_MS).toEqual([1 * MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE]);

    const last = await processOutbox(db, failingProvider, now);
    expect(last).toEqual({ claimed: 1, sent: 0, retried: 0, failed: 1 });

    const row = await reload(message.id);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.lockedUntil).toBeNull();
    expect((await processOutbox(db, failingProvider, new Date(now.getTime() + 365 * 24 * 60 * MINUTE))).claimed).toBe(0);
  });

  it("last_error guarda só o nome do erro, nunca a mensagem com o destinatário", async () => {
    const message = await insertMessage();

    await processOutbox(db, failingProvider, NOW);

    const row = await reload(message.id);
    expect(row.lastError).toBe("ProviderDown");
    expect(row.lastError).not.toContain(RECIPIENT);
  });

  it("uma falha não impede o envio das outras do lote", async () => {
    await insertMessage({ template: "quebra", sendAt: new Date(NOW.getTime() - 2 * MINUTE) });
    await insertMessage({ template: "passa", sendAt: new Date(NOW.getTime() - 1 * MINUTE) });
    const provider: Provider = {
      async sendTemplate(input) {
        if (input.template === "quebra") throw new ProviderDown(input.recipient);
        return { providerMessageId: "ok" };
      },
    };

    expect(await processOutbox(db, provider, NOW)).toEqual({ claimed: 2, sent: 1, retried: 1, failed: 0 });
  });

  it("depois de falhar e ter sucesso, last_error é limpo", async () => {
    const message = await insertMessage();
    await processOutbox(db, failingProvider, NOW);
    const { provider } = recordingProvider();

    await processOutbox(db, provider, new Date(NOW.getTime() + MINUTE));

    const row = await reload(message.id);
    expect(row.status).toBe("sent");
    expect(row.lastError).toBeNull();
    expect(row.attempts).toBe(2);
  });

  it("o log traz as contagens e nunca o destinatário nem o payload", async () => {
    await insertMessage({ payload: { nome: "Marina Segredo" } });
    await insertMessage({ template: "quebra" });
    const provider: Provider = {
      async sendTemplate(input) {
        if (input.template === "quebra") throw new ProviderDown(input.recipient);
        return { providerMessageId: "ok" };
      },
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await processOutbox(db, provider, NOW);

    const logged = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
    error.mockRestore();
    expect(logged).toContain("claimed=2");
    expect(logged).toContain("sent=1");
    expect(logged).toContain("retried=1");
    expect(logged).not.toContain(RECIPIENT);
    expect(logged).not.toContain("Marina Segredo");
  });
});

describe("processOutbox: concorrência", () => {
  it("duas execuções simultâneas não enviam a mesma mensagem", async () => {
    for (let i = 0; i < 20; i++) await insertMessage({ template: `m-${i}` });
    const { provider, calls } = recordingProvider(5);

    const [a, b] = await Promise.all([processOutbox(db, provider, NOW), processOutbox(db, provider, NOW)]);

    expect(a.sent + b.sent).toBe(20);
    expect(calls).toHaveLength(20);
    expect(new Set(calls.map((call) => call.template)).size).toBe(20);
  });

  it("linhas travadas por outra execução são puladas, sem esperar", async () => {
    await insertMessage();
    const { provider, calls } = recordingProvider();
    const client = await testPool.connect();
    try {
      await client.query("begin");
      await client.query("select id from message_outbox for update");

      // Sem SKIP LOCKED esta chamada ficaria esperando o lock e o teste estouraria o tempo.
      const result = await processOutbox(db, provider, NOW);

      expect(result.claimed).toBe(0);
      expect(calls).toHaveLength(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("a reserva grava sending, locked_until = agora + 5 min e soma a tentativa antes de enviar", async () => {
    const message = await insertMessage();
    let during: MessageOutbox | undefined;
    const provider: Provider = {
      async sendTemplate() {
        during = await reload(message.id);
        return { providerMessageId: "ok" };
      },
    };

    await processOutbox(db, provider, NOW);

    expect(during?.status).toBe("sending");
    expect(during?.attempts).toBe(1);
    expect(during?.lockedUntil).toEqual(new Date(NOW.getTime() + OUTBOX_LEASE_MS));
    expect(OUTBOX_LEASE_MS).toBe(5 * MINUTE);
  });
});
```

- [ ] **Passo 2:** `pnpm test src/server/jobs/outbox.test.ts` → falha (módulo não existe).

- [ ] **Passo 3: implementar**

`src/server/jobs/outbox.ts`:
```ts
import "server-only";

import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";

import type { MessagingProvider } from "@/server/adapters/messaging/types";
import { messageOutbox, type MessageOutbox } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";

// Este job processa a fila de TODAS as clínicas de uma vez: por isso recebe o `db` e não um
// TenantScope. Só é chamado pelo cron (src/server/jobs/run.ts), nunca por uma request de usuário.

export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_LEASE_MS = 5 * 60 * 1000;
/** Espera depois da 1ª, 2ª, 3ª e 4ª falha; a 5ª vira `failed`. */
export const OUTBOX_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export type OutboxRunResult = { claimed: number; sent: number; retried: number; failed: number };

/**
 * Reserva um lote: seleciona as mensagens vencidas (ou com reserva expirada) com
 * FOR UPDATE SKIP LOCKED e, na mesma transação, marca como `sending` com prazo. Duas execuções
 * simultâneas nunca reservam a mesma linha, e uma execução que morre libera a mensagem quando
 * o prazo (`locked_until`) passar.
 */
async function claimBatch(db: AnyPgDatabase, now: Date): Promise<MessageOutbox[]> {
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: messageOutbox.id })
      .from(messageOutbox)
      .where(
        or(
          and(eq(messageOutbox.status, "pending"), lte(messageOutbox.sendAt, now)),
          and(eq(messageOutbox.status, "sending"), lt(messageOutbox.lockedUntil, now)),
        ),
      )
      .orderBy(asc(messageOutbox.sendAt))
      .limit(OUTBOX_BATCH_SIZE)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    return tx
      .update(messageOutbox)
      .set({
        status: "sending",
        lockedUntil: new Date(now.getTime() + OUTBOX_LEASE_MS),
        attempts: sql`${messageOutbox.attempts} + 1`,
      })
      .where(
        inArray(
          messageOutbox.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });

  // UPDATE ... RETURNING não garante ordem.
  return claimed.toSorted(
    (a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * Envia as mensagens vencidas da fila. Entrega "ao menos uma vez": se o provedor aceitar e a
 * gravação do sucesso falhar, a mensagem volta a ser enviada quando a reserva expirar.
 */
export async function processOutbox(
  db: AnyPgDatabase,
  provider: Pick<MessagingProvider, "sendTemplate">,
  now: Date = new Date(),
): Promise<OutboxRunResult> {
  const batch = await claimBatch(db, now);
  const result: OutboxRunResult = { claimed: batch.length, sent: 0, retried: 0, failed: 0 };

  for (const message of batch) {
    let providerMessageId: string;
    try {
      // O envio fica fora de qualquer transação: não segura conexão nem lock durante a rede.
      ({ providerMessageId } = await provider.sendTemplate({
        channel: message.channel,
        recipient: message.recipient,
        template: message.template,
        payload: message.payload,
      }));
    } catch (error) {
      // Nunca `error.message`: a mensagem do provedor pode trazer o destinatário.
      const lastError = describeUnexpectedError(error);
      const exhausted = message.attempts >= OUTBOX_MAX_ATTEMPTS;
      await db
        .update(messageOutbox)
        .set(
          exhausted
            ? { status: "failed", lockedUntil: null, lastError }
            : {
                status: "pending",
                lockedUntil: null,
                lastError,
                sendAt: new Date(now.getTime() + OUTBOX_RETRY_DELAYS_MS[message.attempts - 1]),
              },
        )
        .where(eq(messageOutbox.id, message.id));
      if (exhausted) result.failed += 1;
      else result.retried += 1;
      continue;
    }

    await db
      .update(messageOutbox)
      .set({ status: "sent", sentAt: now, providerMessageId, lockedUntil: null, lastError: null })
      .where(eq(messageOutbox.id, message.id));
    result.sent += 1;
  }

  console.info(
    `[outbox] claimed=${result.claimed} sent=${result.sent} retried=${result.retried} failed=${result.failed}`,
  );
  return result;
}
```

- [ ] **Passo 4:** `pnpm test src/server/jobs/outbox.test.ts` → passa.
- [ ] **Passo 5: mutações** (uma por vez; cada uma deve derrubar ao menos um teste; desfaça depois):
  - remover `{ skipLocked: true }` → "linhas travadas… são puladas" estoura o tempo;
  - trocar `lt(messageOutbox.lockedUntil, now)` por `sql\`true\`` → "reserva vigente… não é retomada" falha;
  - trocar `lte(messageOutbox.sendAt, now)` por `sql\`true\`` → "não envia… no futuro" falha;
  - trocar `describeUnexpectedError(error)` por `(error as Error).message` → o teste de `last_error` falha;
  - trocar `>= OUTBOX_MAX_ATTEMPTS` por `> OUTBOX_MAX_ATTEMPTS` → o teste das 5 tentativas falha.
- [ ] **Passo 6:** `pnpm test && pnpm typecheck && pnpm lint` → limpo.
- [ ] **Passo 7: commit** "Adiciona processador da fila de mensagens com reserva e novas tentativas".

---

### Task 5: serviço de auditoria e dados que ele precisa

**Arquivos:**
- Criar: `src/server/services/audit.ts`
- Modificar: `src/server/auth/login.ts`, `src/server/services/staff.ts`
- Testar: `src/server/services/audit.test.ts`, `src/server/auth/login.test.ts`, `src/server/services/staff.test.ts`

**Interfaces:**
- Consome: `TenantScope`, `auditLog`, `describeUnexpectedError`.
- Produz, em `services/audit.ts`:
  - `AUDIT_ACTIONS` (tupla `as const`), `type AuditAction`
  - `type AuditActor = { type: "staff"; id: string } | { type: "system" }`
  - `type AuditEntry = { actor: AuditActor; action: AuditAction; entity: string; entityId?: string; metadata?: Record<string, unknown>; ip?: string | null }`
  - `recordAudit(scope: TenantScope, entry: AuditEntry): Promise<void>`
  - `safeRecordAudit(scope: TenantScope, entry: AuditEntry): Promise<void>` (nunca lança)
- Muda:
  - `LoginResult` de sucesso ganha `staffUserId: string` e `tenantId: string`
  - `changeStaffRole(...)` passa a devolver `Promise<{ previousRole: StaffRole }>`

- [ ] **Passo 1: testes que falham**

`src/server/services/audit.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { auditLog, tenants, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import { AUDIT_ACTIONS, recordAudit, safeRecordAudit } from "./audit";

const db = getTestDb();
const STAFF_ID = "3f2b8c1e-5d4a-4b7e-9a1c-2d6e8f0a1b3c";
const TARGET_ID = "9a1c2d6e-8f0a-4b3c-8f2b-3f2b8c1e5d4a";

let tenantA: Tenant;
let tenantB: Tenant;
let scopeA: TenantScope;

beforeEach(async () => {
  await resetDb();
  [tenantA] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [tenantB] = await db.insert(tenants).values({ slug: "clinica-b", name: "Clínica B" }).returning();
  scopeA = tenantScope(db, tenantA.id);
});

describe("recordAudit", () => {
  it("grava a ação de um staff com a clínica do escopo", async () => {
    await recordAudit(scopeA, {
      actor: { type: "staff", id: STAFF_ID },
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: TARGET_ID,
      metadata: { from: "reception", to: "owner" },
      ip: "203.0.113.7",
    });

    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenantA.id,
      actorType: "staff",
      actorId: STAFF_ID,
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: TARGET_ID,
      metadata: { from: "reception", to: "owner" },
      ip: "203.0.113.7",
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows.some((row) => row.tenantId === tenantB.id)).toBe(false);
  });

  it("ator system grava actor_id nulo; campos opcionais ficam nulos e metadata vazio", async () => {
    await recordAudit(scopeA, { actor: { type: "system" }, action: "staff.created", entity: "staff_user" });

    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      actorType: "system",
      actorId: null,
      entityId: null,
      metadata: {},
      ip: null,
    });
  });

  it("a lista de ações é a da spec", () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      "auth.login",
      "auth.logout",
      "auth.password_changed",
      "staff.created",
      "staff.role_changed",
      "staff.deactivated",
      "staff.reactivated",
      "staff.password_reset",
    ]);
  });
});

describe("safeRecordAudit", () => {
  it("grava normalmente quando dá certo", async () => {
    await safeRecordAudit(scopeA, { actor: { type: "system" }, action: "auth.login", entity: "staff_user" });
    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("não propaga erro e loga só o nome e o código", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      ...scopeA,
      insert: () =>
        Promise.reject(
          Object.assign(new Error("Failed query: insert ... params: 203.0.113.7"), {
            cause: { code: "08006" },
          }),
        ),
    } as TenantScope;

    await expect(
      safeRecordAudit(broken, {
        actor: { type: "staff", id: STAFF_ID },
        action: "auth.login",
        entity: "staff_user",
        ip: "203.0.113.7",
      }),
    ).resolves.toBeUndefined();

    const logged = JSON.stringify(spy.mock.calls);
    spy.mockRestore();
    expect(logged).toContain("08006");
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("Failed query");
  });
});
```

Em `src/server/auth/login.test.ts`, no teste "sucesso: cria sessão válida…", depois de `if (!result.ok) throw …`:
```ts
    expect(result.staffUserId).toBe(activeStaff.id);
    expect(result.tenantId).toBe(tenant.id);
```

Em `src/server/services/staff.test.ts`, no `describe` de `changeStaffRole` (crie um teste novo ao lado dos existentes):
```ts
  it("devolve o papel anterior", async () => {
    const { user } = await createStaff(scopeA, {
      name: "Rita Recepção",
      email: "rita@clinica-a.test",
      role: "reception",
    });

    expect(await changeStaffRole(scopeA, ownerA, user.id, "professional")).toEqual({
      previousRole: "reception",
    });
  });
```

- [ ] **Passo 2:** `pnpm test` → falha.

- [ ] **Passo 3: implementar**

`src/server/services/audit.ts`:
```ts
import "server-only";

import { auditLog } from "@/server/db/schema";
import type { TenantScope } from "@/server/db/tenant-scope";
import { describeUnexpectedError } from "@/server/errors";

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.password_changed",
  "staff.created",
  "staff.role_changed",
  "staff.deactivated",
  "staff.reactivated",
  "staff.password_reset",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditActor = { type: "staff"; id: string } | { type: "system" };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  /** Tipo do registro afetado, por exemplo `staff_user`. */
  entity: string;
  entityId?: string;
  /** Nunca senha, senha provisória, token, e-mail, CPF ou conteúdo clínico. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Grava uma linha no `audit_log` da clínica do escopo. */
export async function recordAudit(scope: TenantScope, entry: AuditEntry): Promise<void> {
  await scope.insert(auditLog, {
    actorType: entry.actor.type,
    actorId: entry.actor.type === "staff" ? entry.actor.id : null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}

/**
 * Versão usada nos pontos de chamada: a ação auditada já aconteceu e não há transação para
 * desfazê-la, então uma falha ao auditar vai só para o log do servidor e não é propagada.
 */
export async function safeRecordAudit(scope: TenantScope, entry: AuditEntry): Promise<void> {
  try {
    await recordAudit(scope, entry);
  } catch (error) {
    console.error(`[audit] falha ao registrar ${entry.action}:`, describeUnexpectedError(error));
  }
}
```

`src/server/auth/login.ts`:
- `LoginResult` de sucesso: `{ ok: true; cookieValue: string; expiresAt: Date; mustChangePassword: boolean; staffUserId: string; tenantId: string }`.
- O `return` final:
```ts
  return {
    ok: true,
    cookieValue,
    expiresAt,
    mustChangePassword: user.mustChangePassword,
    staffUserId: user.id,
    tenantId: user.tenantId,
  };
```

`src/server/services/staff.ts`, `changeStaffRole`: o tipo de retorno vira `Promise<{ previousRole: StaffRole }>` e a função termina com `return { previousRole: target.role };` (o `target` é lido antes do update, então guarda o papel antigo).

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint` → limpo. O `typecheck` aponta `changeRoleAction` (o `run` espera `void` ou `{ temporaryPassword? }`): ajuste provisório `run(staff, async () => { await changeStaffRole(...); })`; a Tarefa 6 reescreve essa action.
- [ ] **Passo 5: commit** "Adiciona serviço de auditoria".

---

### Task 6: auditoria nos pontos de chamada

**Arquivos:**
- Modificar: `src/server/auth/current.ts`, `src/app/(admin)/admin/(painel)/equipe/actions.ts`, `src/app/(admin)/admin/(painel)/equipe/actions.test.ts`, `src/app/(admin)/admin/trocar-senha/actions.ts`, `src/server/db/staff-create.ts`
- Criar: `src/server/auth/current.test.ts`, `src/app/(admin)/admin/trocar-senha/actions.test.ts`

**Interfaces:**
- Consome: `safeRecordAudit`, `AuditEntry`, `LoginResult.staffUserId/tenantId`, `changeStaffRole → { previousRole }`, `clientIp`.
- Produz, em `current.ts`:
  - `type StaffAuditEntry = Omit<AuditEntry, "actor" | "ip">`
  - `recordStaffAudit(staff: Pick<CurrentStaff, "scope" | "user">, entry: StaffAuditEntry): Promise<void>` (preenche ator e IP; nunca lança)
  - `signIn` e `signOut` passam a registrar `auth.login` e `auth.logout`

- [ ] **Passo 1: testes que falham**

`src/server/auth/current.test.ts` (teste de integração: banco de teste no lugar do client; `next/headers` falso):
```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  headers: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined,
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
  }),
  headers: async () => ({ get: (name: string) => request.headers.get(name.toLowerCase()) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/server/db/client", async () => {
  const { getTestDb } = await import("../../../test/db");
  return { db: getTestDb() };
});

import { getTestDb, resetDb } from "../../../test/db";
import { auditLog, staffUsers, tenants, type StaffUser, type Tenant } from "../db/schema";
import { tenantScope, type TenantScope } from "../db/tenant-scope";

import { recordStaffAudit, signIn, signOut } from "./current";
import { hashPassword } from "./password";

const db = getTestDb();
const PASSWORD = "senha-correta-1";
const TARGET_ID = "9a1c2d6e-8f0a-4b3c-8f2b-3f2b8c1e5d4a";

let passwordHash: string;
let tenant: Tenant;
let owner: StaffUser;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetDb();
  request.cookies.clear();
  request.headers.clear();
  request.headers.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
  request.headers.set("user-agent", "vitest");
  [tenant] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [owner] = await db
    .insert(staffUsers)
    .values({ tenantId: tenant.id, name: "Ana Dona", email: "ana@clinica-a.test", passwordHash, role: "owner" })
    .returning();
});

describe("auditoria do login e do logout", () => {
  it("login com sucesso grava auth.login com ator, entidade, clínica e IP", async () => {
    const result = await signIn({ email: owner.email, password: PASSWORD });

    expect(result).toEqual({ ok: true, mustChangePassword: false });
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: tenant.id,
      actorType: "staff",
      actorId: owner.id,
      action: "auth.login",
      entity: "staff_user",
      entityId: owner.id,
      metadata: {},
      ip: "203.0.113.7",
    });
  });

  it("login que falha não grava no audit_log", async () => {
    const result = await signIn({ email: owner.email, password: "senha-errada-1" });

    expect(result.ok).toBe(false);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("logout grava auth.logout e apaga o cookie", async () => {
    await signIn({ email: owner.email, password: PASSWORD });

    await signOut();

    const rows = await db.select().from(auditLog);
    expect(rows.map((row) => row.action).sort()).toEqual(["auth.login", "auth.logout"]);
    const logout = rows.find((row) => row.action === "auth.logout");
    expect(logout).toMatchObject({ actorId: owner.id, entityId: owner.id, ip: "203.0.113.7" });
    expect(request.cookies.size).toBe(0);
  });

  it("logout sem sessão não grava nada", async () => {
    await signOut();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});

describe("recordStaffAudit", () => {
  it("preenche o ator e o IP a partir do staff e da request", async () => {
    await recordStaffAudit(
      { scope: tenantScope(db, tenant.id), user: owner },
      { action: "staff.created", entity: "staff_user", entityId: TARGET_ID, metadata: { role: "reception" } },
    );

    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      tenantId: tenant.id,
      actorType: "staff",
      actorId: owner.id,
      action: "staff.created",
      entityId: TARGET_ID,
      metadata: { role: "reception" },
      ip: "203.0.113.7",
    });
  });

  it("nunca lança, mesmo se a gravação falhar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = {
      ...tenantScope(db, tenant.id),
      insert: () => Promise.reject(new Error("Failed query: params: segredo")),
    } as TenantScope;

    await expect(
      recordStaffAudit({ scope: broken, user: owner }, { action: "staff.created", entity: "staff_user" }),
    ).resolves.toBeUndefined();

    expect(JSON.stringify(spy.mock.calls)).not.toContain("segredo");
    spy.mockRestore();
  });
});
```
Se o `cache` do `react` não existir fora do servidor nesta versão, acrescente `vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));`.

`src/app/(admin)/admin/(painel)/equipe/actions.test.ts`:
- em `mocks`, acrescentar `recordStaffAudit: vi.fn()`; no mock de `@/server/auth/current`, `recordStaffAudit: mocks.recordStaffAudit`;
- em `cases`:
  - `createStaffAction`: `resolved: { user: { id: ID, role: "owner" }, temporaryPassword: "senha-provisoria" }`
  - `changeRoleAction`: `resolved: { previousRole: "reception" }`
- acrescentar a cada caso o campo `audit` e os testes abaixo:
```ts
// audit esperado, por caso:
// createStaffAction   → { action: "staff.created", entity: "staff_user", entityId: ID, metadata: { role: "owner" } }
// changeRoleAction    → { action: "staff.role_changed", entity: "staff_user", entityId: ID, metadata: { from: "reception", to: "owner" } }
// setActiveAction     → { action: "staff.deactivated", entity: "staff_user", entityId: ID }
// resetPasswordAction → { action: "staff.password_reset", entity: "staff_user", entityId: ID }

// dentro do describe.each(cases)("$name", ({ service, call, resolved, audit }) => { ... })
  it("depois do sucesso registra a auditoria, sem a senha provisória", async () => {
    service.mockResolvedValue(resolved);

    await call();

    expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, audit);
    expect(JSON.stringify(mocks.recordStaffAudit.mock.calls)).not.toContain("senha-provisoria");
    expect(service.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recordStaffAudit.mock.invocationCallOrder[0],
    );
  });

  it("se o serviço falhar, nada é auditado", async () => {
    service.mockRejectedValue(new StaffError("Usuário não encontrado."));

    await call();

    expect(mocks.recordStaffAudit).not.toHaveBeenCalled();
  });
```
- no teste "sem permissão…", acrescentar `expect(mocks.recordStaffAudit).not.toHaveBeenCalled();`
- um teste solto:
```ts
it("setActiveAction(id, true) registra staff.reactivated", async () => {
  mocks.setStaffActive.mockResolvedValue(undefined);

  await setActiveAction(ID, true);

  expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, {
    action: "staff.reactivated",
    entity: "staff_user",
    entityId: ID,
  });
});
```

`src/app/(admin)/admin/trocar-senha/actions.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  refreshSessionCookie: vi.fn(),
  recordStaffAudit: vi.fn(),
  changeOwnPassword: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/server/auth/current", () => ({
  requireStaff: mocks.requireStaff,
  refreshSessionCookie: mocks.refreshSessionCookie,
  recordStaffAudit: mocks.recordStaffAudit,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/services/staff", () => {
  class StaffError extends Error {}
  return { StaffError, changeOwnPassword: mocks.changeOwnPassword };
});

import { StaffError } from "@/server/services/staff";

import { changePasswordAction } from "./actions";

const staff = { sessionId: "sessao-1", scope: { tag: "scope" }, user: { id: "actor-id" } };
const input = { currentPassword: "senha-atual-123", newPassword: "senha-nova-456" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireStaff.mockResolvedValue(staff);
});

describe("changePasswordAction", () => {
  it("depois de trocar a senha registra auth.password_changed, sem as senhas", async () => {
    await changePasswordAction(input);

    expect(mocks.requireStaff).toHaveBeenCalledExactlyOnceWith({ allowPasswordChange: true });
    expect(mocks.recordStaffAudit).toHaveBeenCalledExactlyOnceWith(staff, {
      action: "auth.password_changed",
      entity: "staff_user",
      entityId: "actor-id",
    });
    const logged = JSON.stringify(mocks.recordStaffAudit.mock.calls);
    expect(logged).not.toContain("senha-atual-123");
    expect(logged).not.toContain("senha-nova-456");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });

  it("senha atual errada não é auditada nem redireciona", async () => {
    mocks.changeOwnPassword.mockRejectedValue(new StaffError("Senha atual incorreta."));

    expect(await changePasswordAction(input)).toEqual({ error: "Senha atual incorreta." });
    expect(mocks.recordStaffAudit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2:** `pnpm test` → falha.

- [ ] **Passo 3: implementar**

`src/server/auth/current.ts`:
- imports novos: `import { describeUnexpectedError } from "@/server/errors";` e `import { safeRecordAudit, type AuditEntry } from "@/server/services/audit";`
- depois de `requirePermission`:
```ts
export type StaffAuditEntry = Omit<AuditEntry, "actor" | "ip">;

/**
 * Registra no `audit_log` uma ação do staff autenticado, com o IP da request. Chamada pelas
 * Server Actions DEPOIS que a ação deu certo. Nunca lança: a ação já aconteceu.
 */
export async function recordStaffAudit(
  staff: Pick<CurrentStaff, "scope" | "user">,
  entry: StaffAuditEntry,
): Promise<void> {
  try {
    const ip = clientIp((await headers()).get("x-forwarded-for"));
    await safeRecordAudit(staff.scope, { ...entry, actor: { type: "staff", id: staff.user.id }, ip });
  } catch (error) {
    console.error(`[audit] falha ao registrar ${entry.action}:`, describeUnexpectedError(error));
  }
}
```
- em `signIn`, depois de gravar o cookie e antes do `return`:
```ts
  await safeRecordAudit(tenantScope(db, result.tenantId), {
    actor: { type: "staff", id: result.staffUserId },
    action: "auth.login",
    entity: "staff_user",
    entityId: result.staffUserId,
    ip,
  });
```
- `signOut`:
```ts
export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session) {
    await revokeSession(db, session.sessionId);
    await safeRecordAudit(tenantScope(db, session.tenant.id), {
      actor: { type: "staff", id: session.user.id },
      action: "auth.logout",
      entity: "staff_user",
      entityId: session.user.id,
      ip: clientIp((await headers()).get("x-forwarded-for")),
    });
  }
  (await cookies()).delete(SESSION_COOKIE);
}
```

`src/app/(admin)/admin/(painel)/equipe/actions.ts`: importar `recordStaffAudit` de `@/server/auth/current` e trocar as quatro actions por:
```ts
export async function createStaffAction(input: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  return run(staff, async () => {
    const { user, temporaryPassword } = await createStaff(staff.scope, input);
    await recordStaffAudit(staff, {
      action: "staff.created",
      entity: "staff_user",
      entityId: user.id,
      metadata: { role: user.role },
    });
    return { temporaryPassword };
  });
}

export async function changeRoleAction(id: unknown, role: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  const parsedRole = staffRoleSchema.safeParse(role);
  if (!parsedId.success || !parsedRole.success) return INVALID_INPUT;
  return run(staff, async () => {
    const { previousRole } = await changeStaffRole(staff.scope, staff.user, parsedId.data, parsedRole.data);
    await recordStaffAudit(staff, {
      action: "staff.role_changed",
      entity: "staff_user",
      entityId: parsedId.data,
      metadata: { from: previousRole, to: parsedRole.data },
    });
  });
}

export async function setActiveAction(id: unknown, isActive: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  const parsedActive = activeSchema.safeParse(isActive);
  if (!parsedId.success || !parsedActive.success) return INVALID_INPUT;
  return run(staff, async () => {
    await setStaffActive(staff.scope, staff.user, parsedId.data, parsedActive.data);
    await recordStaffAudit(staff, {
      action: parsedActive.data ? "staff.reactivated" : "staff.deactivated",
      entity: "staff_user",
      entityId: parsedId.data,
    });
  });
}

export async function resetPasswordAction(id: unknown): Promise<StaffActionResult> {
  const staff = await requirePermission("staff.manage");
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return INVALID_INPUT;
  return run(staff, async () => {
    const { temporaryPassword } = await resetStaffPassword(staff.scope, staff.user, parsedId.data);
    await recordStaffAudit(staff, {
      action: "staff.password_reset",
      entity: "staff_user",
      entityId: parsedId.data,
    });
    return { temporaryPassword };
  });
}
```

`src/app/(admin)/admin/trocar-senha/actions.ts`: importar `recordStaffAudit`; dentro do `try`, logo depois de `changeOwnPassword(...)`:
```ts
    await recordStaffAudit(staff, {
      action: "auth.password_changed",
      entity: "staff_user",
      entityId: staff.user.id,
    });
```

`src/server/db/staff-create.ts`: importar `safeRecordAudit` de `@/server/services/audit`; logo depois do `createStaff(...)` e antes dos `console.log`:
```ts
    // Ator "system": o comando roda no terminal, sem usuário logado.
    await safeRecordAudit(scope, {
      actor: { type: "system" },
      action: "staff.created",
      entity: "staff_user",
      entityId: user.id,
      metadata: { role: user.role },
    });
```

- [ ] **Passo 4:** `pnpm test && pnpm typecheck && pnpm lint` → limpo.
- [ ] **Passo 5: conferir o comando de terminal** contra o Docker local (`pnpm db:up`, banco com seed):
```bash
pnpm staff:create -- --tenant easyglowcare --name "Teste Auditoria" --email auditoria-0c@easyglowcare.test --role reception
docker compose exec -T postgres psql -U postgres -d easyglowcare -c "select actor_type, actor_id, action, entity, metadata from audit_log order by created_at desc limit 1"
```
Esperado: `system | (nulo) | staff.created | staff_user | {"role": "reception"}`.
- [ ] **Passo 6: commit** "Registra auditoria de acesso e de mudanças na equipe".

---

### Task 7: limpeza de dados antigos

**Arquivos:**
- Criar: `src/server/jobs/cleanup.ts`
- Testar: `src/server/jobs/cleanup.test.ts`

**Interfaces:**
- Consome: `loginAttempts`, `sessions`, `messageOutbox`, `auditLog`, `AnyPgDatabase`.
- Produz:
  - `AUTH_RETENTION_DAYS = 30`, `SENT_MESSAGE_RETENTION_DAYS = 90`
  - `type CleanupResult = { loginAttempts: number; sessions: number; sentMessages: number }`
  - `cleanupOldData(db: AnyPgDatabase, now?: Date): Promise<CleanupResult>`

- [ ] **Passo 1: teste que falha**

`src/server/jobs/cleanup.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import {
  auditLog,
  loginAttempts,
  messageOutbox,
  sessions,
  staffUsers,
  tenants,
  type StaffUser,
  type Tenant,
} from "../db/schema";

import { cleanupOldData } from "./cleanup";

const db = getTestDb();
const NOW = new Date("2026-10-02T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

let tenant: Tenant;
let staff: StaffUser;
let info: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await resetDb();
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  [tenant] = await db.insert(tenants).values({ slug: "clinica-a", name: "Clínica A" }).returning();
  [staff] = await db
    .insert(staffUsers)
    .values({ tenantId: tenant.id, name: "Ana", email: "ana@clinica-a.test", passwordHash: "hash", role: "owner" })
    .returning();
});

afterEach(() => {
  info.mockRestore();
});

function session(tokenHash: string, expiresAt: Date, revokedAt: Date | null = null) {
  return { tenantId: tenant.id, staffUserId: staff.id, tokenHash, expiresAt, revokedAt };
}

function message(template: string, status: "pending" | "sent" | "failed", sentAt: Date | null) {
  return {
    tenantId: tenant.id,
    channel: "sms" as const,
    template,
    recipient: "11987651234",
    sendAt: daysAgo(200),
    status,
    sentAt,
  };
}

describe("cleanupOldData", () => {
  it("apaga login_attempts com mais de 30 dias, com ou sem clínica", async () => {
    await db.insert(loginAttempts).values([
      { email: "velha@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(30, 1) },
      { email: "velha-b@x.test", ip: "1.1.1.1", succeeded: true, createdAt: daysAgo(90), tenantId: tenant.id },
      { email: "no-limite@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(30) },
      { email: "nova@x.test", ip: "1.1.1.1", succeeded: false, createdAt: daysAgo(1) },
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.loginAttempts).toBe(2);
    const left = await db.select().from(loginAttempts);
    expect(left.map((row) => row.email).sort()).toEqual(["no-limite@x.test", "nova@x.test"]);
  });

  it("apaga sessões expiradas ou revogadas há mais de 30 dias e mantém as demais", async () => {
    await db.insert(sessions).values([
      session("expirada-velha", daysAgo(30, 1)),
      session("revogada-velha", new Date(NOW.getTime() + DAY), daysAgo(30, 1)),
      session("expirada-recente", daysAgo(29)),
      session("revogada-recente", new Date(NOW.getTime() + DAY), daysAgo(29)),
      session("ativa", new Date(NOW.getTime() + DAY)),
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.sessions).toBe(2);
    const left = await db.select().from(sessions);
    expect(left.map((row) => row.tokenHash).sort()).toEqual(["ativa", "expirada-recente", "revogada-recente"]);
  });

  it("apaga só mensagens sent com mais de 90 dias; pending e failed ficam", async () => {
    await db.insert(messageOutbox).values([
      message("sent-velha", "sent", daysAgo(90, 1)),
      message("sent-no-limite", "sent", daysAgo(90)),
      message("sent-recente", "sent", daysAgo(10)),
      // Com sent_at antigo de propósito: só o filtro de status impede que seja apagada.
      message("failed-velha", "failed", daysAgo(200)),
      message("pending-velha", "pending", null),
    ]);

    const result = await cleanupOldData(db, NOW);

    expect(result.sentMessages).toBe(1);
    const left = await db.select().from(messageOutbox);
    expect(left.map((row) => row.template).sort()).toEqual([
      "failed-velha",
      "pending-velha",
      "sent-no-limite",
      "sent-recente",
    ]);
  });

  it("nunca apaga o audit_log", async () => {
    await db.insert(auditLog).values({
      tenantId: tenant.id,
      actorType: "system",
      action: "staff.created",
      entity: "staff_user",
      createdAt: daysAgo(3650),
    });

    await cleanupOldData(db, NOW);

    expect(await db.select().from(auditLog)).toHaveLength(1);
  });

  it("sem nada para apagar devolve zeros e loga só as contagens", async () => {
    expect(await cleanupOldData(db, NOW)).toEqual({ loginAttempts: 0, sessions: 0, sentMessages: 0 });
    expect(JSON.stringify(info.mock.calls)).toContain("login_attempts=0");
  });
});
```

- [ ] **Passo 2:** `pnpm test src/server/jobs/cleanup.test.ts` → falha.

- [ ] **Passo 3: implementar**

`src/server/jobs/cleanup.ts`:
```ts
import "server-only";

import { and, eq, lt, or } from "drizzle-orm";

import { loginAttempts, messageOutbox, sessions } from "@/server/db/schema";
import type { AnyPgDatabase } from "@/server/db/tenant-scope";

// Limpeza de TODAS as clínicas de uma vez (e de `login_attempts` sem clínica): recebe o `db`,
// não um TenantScope. Só é chamada pelo cron (src/server/jobs/run.ts).
// `audit_log` e mensagens `failed` nunca são apagadas aqui (decisão D10 da spec do 0C).

export const AUTH_RETENTION_DAYS = 30;
export const SENT_MESSAGE_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CleanupResult = { loginAttempts: number; sessions: number; sentMessages: number };

/** Apaga dados pessoais antigos que não têm mais uso (e-mail e IP de tentativas, sessões mortas). */
export async function cleanupOldData(db: AnyPgDatabase, now: Date = new Date()): Promise<CleanupResult> {
  const authCutoff = new Date(now.getTime() - AUTH_RETENTION_DAYS * DAY_MS);
  const sentCutoff = new Date(now.getTime() - SENT_MESSAGE_RETENTION_DAYS * DAY_MS);

  const deletedAttempts = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, authCutoff))
    .returning({ id: loginAttempts.id });

  const deletedSessions = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, authCutoff), lt(sessions.revokedAt, authCutoff)))
    .returning({ id: sessions.id });

  const deletedMessages = await db
    .delete(messageOutbox)
    .where(and(eq(messageOutbox.status, "sent"), lt(messageOutbox.sentAt, sentCutoff)))
    .returning({ id: messageOutbox.id });

  const result: CleanupResult = {
    loginAttempts: deletedAttempts.length,
    sessions: deletedSessions.length,
    sentMessages: deletedMessages.length,
  };
  console.info(
    `[cleanup] login_attempts=${result.loginAttempts} sessions=${result.sessions} sent_messages=${result.sentMessages}`,
  );
  return result;
}
```

- [ ] **Passo 4:** `pnpm test src/server/jobs/cleanup.test.ts` → passa. Mutações (desfaça depois): remova `eq(messageOutbox.status, "sent")` → o teste das mensagens falha (a `failed-velha` é apagada); troque `lt(sessions.revokedAt, authCutoff)` por `lt(sessions.revokedAt, now)` → o teste das sessões falha.
- [ ] **Passo 5:** `pnpm test && pnpm typecheck && pnpm lint` → limpo.
- [ ] **Passo 6: commit** "Adiciona limpeza de tentativas de login, sessões e mensagens antigas".

---

### Task 8: rotas de cron

**Arquivos:**
- Criar: `src/server/jobs/cron-auth.ts`, `src/server/jobs/run.ts`, `src/app/api/cron/outbox/route.ts`, `src/app/api/cron/cleanup/route.ts`
- Modificar: `src/server/db/imports.test.ts`, `vercel.json`, `.env.local` (não versionado)
- Testar: `src/server/jobs/cron-auth.test.ts`, `src/app/api/cron/cron-routes.test.ts`

**Interfaces:**
- Consome: `processOutbox`, `cleanupOldData`, `getMessagingProvider`, `db` do client, `getEnv().CRON_SECRET`, `describeUnexpectedError`.
- Produz:
  - `isAuthorizedCron(request: Request, secret?: string | undefined): boolean`
  - `runOutboxJob(): Promise<OutboxRunResult>`, `runCleanupJob(): Promise<CleanupResult>`
  - `GET /api/cron/outbox`, `GET /api/cron/cleanup`

- [ ] **Passo 1: ler a documentação do Next** indicada nas restrições globais (`route.md`, `maxDuration.md`).

- [ ] **Passo 2: testes que falham**

`src/server/jobs/cron-auth.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCron } from "./cron-auth";

const SECRET = "segredo-do-cron-0123456789";
const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/outbox", {
    headers: authorization === undefined ? {} : { authorization },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAuthorizedCron", () => {
  it("aceita Bearer com o segredo certo", () => {
    expect(isAuthorizedCron(request(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it.each([
    ["sem cabeçalho", undefined],
    ["cabeçalho vazio", ""],
    ["segredo errado", "Bearer outro-segredo-0123456789"],
    ["sem o prefixo Bearer", SECRET],
    ["prefixo em minúsculas", `bearer ${SECRET}`],
    ["segredo certo com sobra", `Bearer ${SECRET}x`],
    ["só o começo do segredo", `Bearer ${SECRET.slice(0, 10)}`],
  ])("recusa: %s", (_name, authorization) => {
    expect(isAuthorizedCron(request(authorization), SECRET)).toBe(false);
  });

  it("sem segredo configurado recusa tudo, inclusive 'Bearer undefined' e 'Bearer '", () => {
    expect(isAuthorizedCron(request("Bearer undefined"), undefined)).toBe(false);
    expect(isAuthorizedCron(request("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedCron(request(), undefined)).toBe(false);
  });

  it("por padrão lê CRON_SECRET do ambiente", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect(isAuthorizedCron(request(`Bearer ${SECRET}`))).toBe(true);

    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCron(request(`Bearer ${SECRET}`))).toBe(false);
  });
});
```

`src/app/api/cron/cron-routes.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runOutboxJob: vi.fn(), runCleanupJob: vi.fn() }));

vi.mock("@/server/jobs/run", () => ({
  runOutboxJob: mocks.runOutboxJob,
  runCleanupJob: mocks.runCleanupJob,
}));

import { GET as cleanupGET } from "./cleanup/route";
import { GET as outboxGET } from "./outbox/route";

const SECRET = "segredo-do-cron-0123456789";

const routes = [
  {
    name: "/api/cron/outbox",
    GET: outboxGET,
    job: mocks.runOutboxJob,
    counts: { claimed: 2, sent: 1, retried: 1, failed: 0 },
  },
  {
    name: "/api/cron/cleanup",
    GET: cleanupGET,
    job: mocks.runCleanupJob,
    counts: { loginAttempts: 3, sessions: 2, sentMessages: 1 },
  },
];

const request = (name: string, authorization?: string) =>
  new Request(`http://localhost${name}`, {
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(routes)("GET $name", ({ name, GET, job, counts }) => {
  it("sem cabeçalho: 401 e o job não roda", async () => {
    const response = await GET(request(name));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(job).not.toHaveBeenCalled();
  });

  it("segredo errado: 401 e o job não roda", async () => {
    const response = await GET(request(name, "Bearer segredo-errado-0123456789"));

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("sem CRON_SECRET configurado: 401 mesmo com cabeçalho", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("segredo certo: 200 com as contagens", async () => {
    job.mockResolvedValue(counts);

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
    expect(job).toHaveBeenCalledOnce();
  });

  it("erro no job: 500 sem detalhe, e o log não carrega a mensagem", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    job.mockRejectedValue(
      Object.assign(new Error("Failed query: ... params: 11987651234"), { cause: { code: "08006" } }),
    );

    const response = await GET(request(name, `Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal" });
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("08006");
    expect(logged).not.toContain("11987651234");
  });
});
```

Em `src/server/db/imports.test.ts`:
```ts
const ALLOWED = [
  "src/server/auth/current.ts",
  "src/server/jobs/run.ts",
  "src/server/services/tenants.ts",
];
```
e atualize o comentário acima da lista: "…(ex.: sessão no 0B, jobs de cron no 0C)".

- [ ] **Passo 3:** `pnpm test` → falha.

- [ ] **Passo 4: implementar**

`src/server/jobs/cron-auth.ts`:
```ts
import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { getEnv } from "@/lib/env";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Confere `Authorization: Bearer <CRON_SECRET>` (é o que o cron da Vercel envia). Sem segredo
 * configurado, recusa tudo. Compara os hashes em tempo constante: o tempo de resposta não
 * revela quantos caracteres do segredo estavam certos.
 */
export function isAuthorizedCron(
  request: Request,
  secret: string | undefined = getEnv().CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}
```

`src/server/jobs/run.ts`:
```ts
import "server-only";

import { getMessagingProvider } from "@/server/adapters/messaging";
import { db } from "@/server/db/client";

import { cleanupOldData, type CleanupResult } from "./cleanup";
import { processOutbox, type OutboxRunResult } from "./outbox";

// Único módulo de jobs autorizado a importar @/server/db/client: os crons processam todas as
// clínicas de uma vez e por isso não passam pelo tenantScope. Só as rotas /api/cron/* chamam
// estas funções, depois de `isAuthorizedCron`.

export function runOutboxJob(): Promise<OutboxRunResult> {
  return processOutbox(db, getMessagingProvider());
}

export function runCleanupJob(): Promise<CleanupResult> {
  return cleanupOldData(db);
}
```

`src/app/api/cron/outbox/route.ts`:
```ts
import { describeUnexpectedError } from "@/server/errors";
import { isAuthorizedCron } from "@/server/jobs/cron-auth";
import { runOutboxJob } from "@/server/jobs/run";

export const maxDuration = 60;

// Chamado pelo cron da Vercel (vercel.json), que envia `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runOutboxJob());
  } catch (error) {
    console.error("[cron:outbox] erro inesperado:", describeUnexpectedError(error));
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
```

`src/app/api/cron/cleanup/route.ts`: igual, trocando `runOutboxJob` por `runCleanupJob` e o rótulo do log por `[cron:cleanup]`:
```ts
import { describeUnexpectedError } from "@/server/errors";
import { isAuthorizedCron } from "@/server/jobs/cron-auth";
import { runCleanupJob } from "@/server/jobs/run";

export const maxDuration = 60;

// Chamado pelo cron da Vercel (vercel.json), que envia `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await runCleanupJob());
  } catch (error) {
    console.error("[cron:cleanup] erro inesperado:", describeUnexpectedError(error));
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
```
Se a documentação do Next 16 indicar outra assinatura ou configuração para Route Handlers dinâmicos, siga a documentação e mantenha o comportamento dos testes.

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["gru1"],
  "crons": [
    { "path": "/api/cron/outbox", "schedule": "0 9 * * *" },
    { "path": "/api/cron/cleanup", "schedule": "30 9 * * *" }
  ]
}
```

`.env.local`: preencher `CRON_SECRET` com um valor gerado por `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Não imprima o valor em lugar nenhum.

- [ ] **Passo 5:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → limpo. No resumo do build, as duas rotas `/api/cron/*` aparecem como dinâmicas (ƒ).
- [ ] **Passo 6: mutações** (desfaça depois): em `cron-auth.ts`, troque `if (!secret) return false;` por nada → os testes "sem segredo configurado" falham; troque o `timingSafeEqual(...)` por `true` → os testes de recusa falham.
- [ ] **Passo 7: commit** "Adiciona rotas de cron da fila e da limpeza protegidas por CRON_SECRET".

---

### Task 9: documentação e verificação final

**Arquivos:**
- Modificar: `.env.example`, `README.md`, `ROADMAP.md`

**Interfaces:** nenhuma.

- [ ] **Passo 1: `.env.example`**

Trocar o bloco do `CRON_SECRET` por:
```
# Token exigido nas rotas /api/cron/* (mínimo de 16 caracteres). Sem ele, os crons respondem 401.
# Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CRON_SECRET=
```
e o comentário do `SESSION_SECRET` por `# Obrigatória; gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

- [ ] **Passo 2: `README.md`**

- Trocar as duas ocorrências de `openssl rand -base64 32` pelo comando `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (o `openssl` não existe no PowerShell).
- Em "Neon + Vercel", deixar uma linha em branco entre o item 2 da primeira lista e o parágrafo "Antes do primeiro deploy da Fase 0B…" (hoje a numeração se mistura); atualizar "a mais recente é a `0002_staff_auth`" para "a mais recente é a `0003_outbox_audit` (só acrescenta tabelas)".
- Acrescentar, antes de "## Neon + Vercel", a seção:

````markdown
## Fila de mensagens, auditoria e limpeza

Nenhuma mensagem é enviada na hora: o código grava em `message_outbox` e um cron envia. Em
desenvolvimento, o provedor `console` só imprime no terminal o canal, o modelo e o destinatário
mascarado. As ações de acesso e de equipe ficam registradas em `audit_log` (ainda sem tela;
consulte pelo `pnpm db:studio`).

| Rota | O que faz | Agendamento (`vercel.json`) |
|---|---|---|
| `/api/cron/outbox` | Envia as mensagens vencidas (até 50 por execução, 5 tentativas) | 06:00 de Brasília, todo dia |
| `/api/cron/cleanup` | Apaga tentativas de login e sessões com mais de 30 dias e mensagens enviadas há mais de 90 | 06:30 de Brasília, todo dia |

As duas rotas exigem o cabeçalho `Authorization: Bearer <CRON_SECRET>`; sem a variável
`CRON_SECRET` definida, respondem 401 e nada é processado. Para chamar localmente (com
`pnpm dev` rodando e `CRON_SECRET` no `.env.local`), no PowerShell:

```powershell
$env:CRON_SECRET = 'o mesmo valor do .env.local'
Invoke-RestMethod http://localhost:3000/api/cron/outbox -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
Remove-Item Env:CRON_SECRET
```

**Na Vercel:** cadastre `CRON_SECRET` em Production e em Preview, com valores diferentes (gere
com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). A Vercel
envia esse cabeçalho sozinha nas chamadas de cron. Aplique a migration `0003_outbox_audit` em
cada banco antes do deploy (mesmo passo a passo de "Neon + Vercel").

**Plano Hobby x Pro:** o plano Hobby só aceita cron uma vez por dia, por isso a fila roda às
06:00. Antes de ligar os lembretes (Etapa 4), passe para o plano Pro e troque o agendamento da
fila no `vercel.json` para `*/5 * * * *`. No Hobby, um agendamento mais frequente faz o deploy
falhar.
````

- [ ] **Passo 3: `ROADMAP.md`**

Na Fase 0:
```markdown
- [x] Adapters com implementação `console`/`mock`: mensagens, pagamento, assinatura
- [x] Tabela `message_outbox` + rota `/api/cron/outbox` (cron diário no Hobby; ver "Recomendados")
- [ ] `audit_log`, seed da "EasyGlowCare", CI (lint, typecheck, testes) (seed e `audit_log` feitos; CI pendente no 0D)
```
Na tabela "Recomendados (qualidade e segurança)":
- trocar a linha "Retenção dos registros de login e das sessões" por:
  `| Retenção dos registros de login e das sessões | Feito no 0C: `/api/cron/cleanup` apaga `login_attempts` e `sessions` com mais de 30 dias e mensagens enviadas há mais de 90 | Feito | Prazo de guarda do `audit_log` é decisão do dono, com orientação jurídica; hoje nunca é apagado |`
- acrescentar:
  `| Fila de mensagens a cada 5 minutos | Trocar o agendamento de `/api/cron/outbox` para `*/5 * * * *` | Antes da Etapa 4 (exige Vercel Pro) | Hoje a fila roda uma vez por dia, limite do Hobby |`
  `| Tela de consulta da auditoria | Listar o `audit_log` no painel, com filtro por pessoa e período | MVP (com prontuário e preços) | Hoje a consulta é direto no banco |`

- [ ] **Passo 4: verificação automática completa**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```
Tudo limpo. (O `test:e2e` refaz o seed do banco local; rode `pnpm db:seed` depois se quiser voltar à senha do `.env.local`.)

- [ ] **Passo 5: verificação manual local** (Docker de pé, `pnpm db:seed` feito, `pnpm dev` rodando em segundo plano)

1. Sem cabeçalho: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/outbox` → `401`.
2. Enfileirar uma mensagem à mão:
```bash
docker compose exec -T postgres psql -U postgres -d easyglowcare -c "insert into message_outbox (tenant_id, channel, template, recipient, send_at) select id, 'whatsapp', 'teste.manual', '11987651234', now() from tenants where slug = 'easyglowcare'"
```
3. Com o segredo (lido do `.env.local`, sem imprimir): `node --env-file=.env.local -e "fetch('http://localhost:3000/api/cron/outbox',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(async r=>console.log(r.status, await r.text()))"` → `200 {"claimed":1,"sent":1,"retried":0,"failed":0}`; o terminal do `pnpm dev` mostra `[messaging:console] modelo=teste.manual canal=whatsapp para=*******1234`.
4. `docker compose exec -T postgres psql -U postgres -d easyglowcare -c "select status, attempts, provider_message_id is not null as tem_id from message_outbox where template = 'teste.manual'"` → `sent | 1 | t`.
5. Mesma chamada do item 3 para `/api/cron/cleanup` → `200` com as três contagens.
6. No navegador em 375px: entrar em `/admin/login` como `dono@easyglowcare.test`, cadastrar uma pessoa em `/admin/equipe`, sair. Depois:
```bash
docker compose exec -T postgres psql -U postgres -d easyglowcare -c "select action, actor_type, metadata from audit_log order by created_at desc limit 3"
```
   → `auth.logout`, `staff.created` (com `{"role": …}`) e `auth.login`.
7. Parar o servidor de dev pelo PID da porta 3000 (PowerShell: `Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess`, depois `Stop-Process -Id <pid>`).

- [ ] **Passo 6: commit** "Atualiza documentação da Fase 0C".

---

## Depois do merge (fica com o dono do repositório)

1. Cadastrar `CRON_SECRET` na Vercel, em Production e em Preview, com valores diferentes.
2. Rodar `pnpm db:migrate` em staging e em produção (passo a passo no README, seção "Neon + Vercel").
