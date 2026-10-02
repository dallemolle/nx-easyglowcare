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
