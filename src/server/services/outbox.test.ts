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
