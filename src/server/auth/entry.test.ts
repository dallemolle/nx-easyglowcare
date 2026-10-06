import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTestDb, resetDb } from "../../../test/db";
import { parseOriginCookie } from "../../lib/lead-origin";
import type { MessagingProvider, SendOtpInput } from "../adapters/messaging";
import { otpCodes, people, personConsents, personSessions, tenants, type Person, type Tenant } from "../db/schema";

import { validateClientSession } from "./client-session";
import { resendCode, startEntry, startSignup, verifyCode, type EntryDeps } from "./entry";

const db = getTestDb();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = new Date("2026-10-05T12:00:00.000Z");
const META = { ip: "203.0.113.7", userAgent: "vitest" };

const CPF = "52998224725";
const PHONE = "11987654321";
const NAME = "Maria Silva";
const SIGNUP = {
  cpf: " 529.982.247-25 ",
  name: NAME,
  phone: "(11) 98765-4321",
  acceptTerms: true,
  marketing: true,
};

const EXPIRED = "Este código expirou. Peça um novo.";
const EXHAUSTED = "Você errou o código 5 vezes. Peça um novo.";
const LIMIT = "Muitas tentativas. Tente de novo em alguns minutos.";
const SEND_FAILED = "Não conseguimos enviar o código agora. Tente de novo em instantes.";
const CPF_TAKEN = "Este CPF já tem cadastro. Entre de novo com seu CPF.";
const WAIT = "Aguarde para pedir um novo código.";

function fakeMessaging() {
  const sent: SendOtpInput[] = [];
  const state = { fail: false };
  const provider: MessagingProvider = {
    name: "fake",
    async sendOtp(input) {
      if (state.fail) {
        // A mensagem carrega dados pessoais de propósito: o log nunca pode usá-la.
        throw new Error(`falha ao enviar para ${input.recipient} (CPF ${CPF}, ${NAME}) código ${input.code}`);
      }
      sent.push(input);
      return { providerMessageId: `msg-${sent.length}` };
    },
    async sendTemplate() {
      throw new Error("não usado");
    },
  };
  return { provider, sent, state };
}

let tenant: Tenant;
let otherTenant: Tenant;
let messaging: ReturnType<typeof fakeMessaging>;
let deps: EntryDeps;

beforeEach(async () => {
  await resetDb();
  [tenant] = await db.insert(tenants).values({ slug: "easyglowcare", name: "EasyGlowCare" }).returning();
  [otherTenant] = await db.insert(tenants).values({ slug: "outra-clinica", name: "Outra Clínica" }).returning();
  messaging = fakeMessaging();
  deps = { messaging: messaging.provider, testPhones: [] };
});

afterEach(() => {
  vi.restoreAllMocks();
});

function at(ms: number): Date {
  return new Date(T0.getTime() + ms);
}

function lastCode(): string {
  const last = messaging.sent.at(-1);
  if (!last) throw new Error("nenhum código enviado");
  return last.code;
}

function wrongCode(code: string): string {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}

async function insertPerson(overrides: Partial<typeof people.$inferInsert> = {}): Promise<Person> {
  const [person] = await db
    .insert(people)
    .values({ tenantId: tenant.id, name: "Ana", cpf: CPF, phone: "21987651234", source: "direct", ...overrides })
    .returning();
  return person;
}

async function signup(input: object = SIGNUP, now: Date = T0) {
  const result = await startSignup(db, tenant.id, input, {}, META, deps, now);
  if (result.kind !== "code-sent") throw new Error(`esperava code-sent, veio ${JSON.stringify(result)}`);
  return result;
}

async function challengeRow(id: string) {
  const [row] = await db.select().from(otpCodes).where(eq(otpCodes.id, id));
  return row;
}

describe("pessoa nova", () => {
  it("CPF novo → cadastro → código → sessão, com lead e dois consentimentos", async () => {
    const entry = await startEntry(db, tenant.id, { cpf: SIGNUP.cpf }, META, deps, T0);
    expect(entry).toEqual({ kind: "needs-signup", cpf: CPF });

    const sent = await startSignup(db, tenant.id, SIGNUP, { utm_source: "instagram" }, META, deps, T0);
    expect(sent).toEqual({
      kind: "code-sent",
      challengeId: expect.any(String),
      maskedPhone: "(11) *****-4321",
      channel: "whatsapp",
      resendAvailableAt: at(60 * SECOND),
    });
    expect(messaging.sent).toEqual([{ channel: "whatsapp", recipient: PHONE, code: expect.stringMatching(/^\d{6}$/) }]);
    expect(await db.select().from(people)).toHaveLength(0);

    if (sent.kind !== "code-sent") throw new Error("inesperado");
    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, at(MINUTE));

    if (result.kind !== "signed-in") throw new Error(`esperava signed-in, veio ${JSON.stringify(result)}`);
    const [person] = await db.select().from(people);
    expect(person).toMatchObject({
      id: result.personId,
      tenantId: tenant.id,
      status: "lead",
      name: NAME,
      cpf: CPF,
      phone: PHONE,
      source: "instagram",
      phoneVerifiedAt: at(MINUTE),
    });

    const consents = await db.select().from(personConsents).where(eq(personConsents.personId, person.id));
    expect(consents.map(({ kind, granted, version }) => ({ kind, granted, version })).sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: "marketing", granted: true, version: "v1" },
      { kind: "terms", granted: true, version: "v1" },
    ]);

    const session = await validateClientSession(db, tenant.id, result.cookieValue, at(MINUTE));
    expect(session?.person.id).toBe(person.id);
    expect((await challengeRow(sent.challengeId)).consumedAt).toEqual(at(MINUTE));
  });
});

describe("cookie de origem adulterado", () => {
  it("valor com \\u0000 ou metade de emoji não impede o cadastro", async () => {
    const poisoned = JSON.stringify({ ref: "a\u0000b", utm_campaign: "x\ud83d", utm_source: "instagram" });

    const sent = await startSignup(db, tenant.id, SIGNUP, parseOriginCookie(poisoned), META, deps, T0);

    if (sent.kind !== "code-sent") throw new Error(`esperava code-sent, veio ${JSON.stringify(sent)}`);
    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, T0);
    expect(result.kind).toBe("signed-in");
    const [person] = await db.select().from(people);
    expect(person.source).toBe("instagram");
  });
});

describe("pessoa existente", () => {
  it("envia para o telefone cadastrado e abre a sessão sem criar pessoa", async () => {
    const person = await insertPerson();

    const sent = await startEntry(db, tenant.id, { cpf: CPF }, META, deps, T0);

    expect(sent).toMatchObject({ kind: "code-sent", maskedPhone: "(21) *****-1234", channel: "whatsapp" });
    expect(messaging.sent).toEqual([{ channel: "whatsapp", recipient: "21987651234", code: expect.any(String) }]);
    if (sent.kind !== "code-sent") throw new Error("inesperado");
    expect(await challengeRow(sent.challengeId)).toMatchObject({ purpose: "login", personId: person.id, pendingSignup: null });

    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, at(MINUTE));

    expect(result).toMatchObject({ kind: "signed-in", personId: person.id });
    const rows = await db.select().from(people);
    expect(rows).toHaveLength(1);
    expect(rows[0].phoneVerifiedAt).toEqual(at(MINUTE));
    expect(await db.select().from(personSessions)).toHaveLength(1);
  });

  it("telefone trocado entre o envio e a verificação: código não vale e não abre sessão", async () => {
    const person = await insertPerson();
    const sent = await startEntry(db, tenant.id, { cpf: CPF }, META, deps, T0);
    if (sent.kind !== "code-sent") throw new Error("inesperado");
    await db.update(people).set({ phone: "31987650000" }).where(eq(people.id, person.id));

    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, at(MINUTE));

    expect(result).toEqual({ kind: "error", error: EXPIRED, restart: true });
    expect(await db.select().from(personSessions)).toHaveLength(0);
    const [row] = await db.select().from(people);
    expect(row.phoneVerifiedAt).toBeNull();
  });

  it("startSignup com CPF já cadastrado age como login (código para o telefone cadastrado)", async () => {
    const person = await insertPerson();

    const sent = await signup();

    expect(sent.maskedPhone).toBe("(21) *****-1234");
    expect(messaging.sent[0].recipient).toBe("21987651234");
    expect(await challengeRow(sent.challengeId)).toMatchObject({ purpose: "login", personId: person.id });

    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, T0);
    expect(result).toMatchObject({ kind: "signed-in", personId: person.id });
    expect(await db.select().from(people)).toHaveLength(1);
  });

  it("CPF cadastrado em outra clínica é CPF novo nesta", async () => {
    await insertPerson({ tenantId: otherTenant.id });

    expect(await startEntry(db, tenant.id, { cpf: CPF }, META, deps, T0)).toEqual({ kind: "needs-signup", cpf: CPF });
  });
});

describe("telefone de teste", () => {
  it("não chama o provedor e aceita 000000", async () => {
    deps = { ...deps, testPhones: [PHONE] };

    const sent = await signup();

    expect(messaging.sent).toHaveLength(0);
    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: "000000" }, META, T0);
    expect(result.kind).toBe("signed-in");
  });
});

describe("entrada inválida", () => {
  it("devolve a primeira mensagem do Zod sem voltar ao CPF", async () => {
    expect(await startEntry(db, tenant.id, { cpf: "123" }, META, deps, T0)).toEqual({
      kind: "error",
      error: "CPF inválido. Confira os números.",
      restart: false,
    });
    expect(await startSignup(db, tenant.id, { ...SIGNUP, acceptTerms: false }, {}, META, deps, T0)).toEqual({
      kind: "error",
      error: "Para continuar, aceite os Termos de Uso e a Política de Privacidade.",
      restart: false,
    });

    const sent = await signup();
    expect(await verifyCode(db, tenant.id, sent.challengeId, { code: "12" }, META, T0)).toEqual({
      kind: "error",
      error: "Digite os 6 números do código.",
      restart: false,
    });
    expect(await resendCode(db, tenant.id, sent.challengeId, { channel: "email" }, META, deps, at(MINUTE))).toMatchObject({
      kind: "error",
      restart: false,
    });
    expect(messaging.sent).toHaveLength(1);
  });

  it("challengeId que não é UUID responde como expirado", async () => {
    expect(await verifyCode(db, tenant.id, "nao-e-uuid", { code: "123456" }, META, T0)).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });
    expect(await resendCode(db, tenant.id, "nao-e-uuid", { channel: "sms" }, META, deps, T0)).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });
  });
});

describe("erros de código", () => {
  it("conta as tentativas, encerra no 5º erro e depois disso o código certo expira", async () => {
    const sent = await signup();
    const code = lastCode();
    const wrong = wrongCode(code);
    const verify = (c: string) => verifyCode(db, tenant.id, sent.challengeId, { code: c }, META, T0);

    const messages = [];
    for (let i = 0; i < 5; i++) messages.push(await verify(wrong));

    expect(messages).toEqual([
      { kind: "error", error: "Código incorreto. Restam 4 tentativas.", restart: false },
      { kind: "error", error: "Código incorreto. Restam 3 tentativas.", restart: false },
      { kind: "error", error: "Código incorreto. Restam 2 tentativas.", restart: false },
      { kind: "error", error: "Código incorreto. Resta 1 tentativa.", restart: false },
      { kind: "error", error: EXHAUSTED, restart: false },
    ]);
    expect((await challengeRow(sent.challengeId)).invalidatedAt).toEqual(T0);

    expect(await verify(code)).toEqual({ kind: "error", error: EXPIRED, restart: false });
    expect(await db.select().from(personSessions)).toHaveLength(0);
    expect(await db.select().from(people)).toHaveLength(0);
  });

  it("código expirado depois de 5 minutos", async () => {
    const sent = await signup();

    const result = await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, at(5 * MINUTE));

    expect(result).toEqual({ kind: "error", error: EXPIRED, restart: false });
    expect(await db.select().from(people)).toHaveLength(0);
  });

  it("desafio de outra clínica responde como expirado e não toca na linha", async () => {
    const sent = await signup();
    const code = lastCode();

    expect(await verifyCode(db, otherTenant.id, sent.challengeId, { code }, META, T0)).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });
    expect(await resendCode(db, otherTenant.id, sent.challengeId, { channel: "sms" }, META, deps, at(MINUTE))).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });

    expect(await db.select().from(personSessions)).toHaveLength(0);
    expect(await db.select().from(people)).toHaveLength(0);
    expect(messaging.sent).toHaveLength(1);
    expect(await challengeRow(sent.challengeId)).toMatchObject({ attempts: 0, consumedAt: null, invalidatedAt: null });

    // Na clínica certa o mesmo código continua valendo.
    expect((await verifyCode(db, tenant.id, sent.challengeId, { code }, META, T0)).kind).toBe("signed-in");
  });
});

describe("reenvio", () => {
  it("recusa antes de 60 s; depois invalida o anterior e respeita o canal sms", async () => {
    const first = await signup();
    const firstCode = lastCode();

    expect(await resendCode(db, tenant.id, first.challengeId, { channel: "sms" }, META, deps, at(59 * SECOND))).toEqual({
      kind: "error",
      error: WAIT,
      restart: false,
    });
    expect(messaging.sent).toHaveLength(1);

    const second = await resendCode(db, tenant.id, first.challengeId, { channel: "sms" }, META, deps, at(60 * SECOND));

    expect(second).toEqual({
      kind: "code-sent",
      challengeId: expect.any(String),
      maskedPhone: "(11) *****-4321",
      channel: "sms",
      resendAvailableAt: at(120 * SECOND),
    });
    if (second.kind !== "code-sent") throw new Error("inesperado");
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(messaging.sent[1]).toMatchObject({ channel: "sms", recipient: PHONE });
    expect(await challengeRow(first.challengeId)).toMatchObject({ invalidatedAt: at(60 * SECOND) });
    expect(await challengeRow(second.challengeId)).toMatchObject({
      purpose: "signup",
      channel: "sms",
      phone: PHONE,
      pendingSignup: (await challengeRow(first.challengeId)).pendingSignup,
    });

    expect(await verifyCode(db, tenant.id, first.challengeId, { code: firstCode }, META, at(61 * SECOND))).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });
    const result = await verifyCode(db, tenant.id, second.challengeId, { code: lastCode() }, META, at(61 * SECOND));
    expect(result.kind).toBe("signed-in");
    expect(await db.select().from(people)).toHaveLength(1);
  });

  it("reenvio de login mantém a pessoa e o telefone cadastrado", async () => {
    const person = await insertPerson();
    const first = await startEntry(db, tenant.id, { cpf: CPF }, META, deps, T0);
    if (first.kind !== "code-sent") throw new Error("inesperado");

    const second = await resendCode(db, tenant.id, first.challengeId, { channel: "whatsapp" }, META, deps, at(MINUTE));

    if (second.kind !== "code-sent") throw new Error("inesperado");
    expect(await challengeRow(second.challengeId)).toMatchObject({
      purpose: "login",
      personId: person.id,
      phone: "21987651234",
      pendingSignup: null,
    });
    expect((await verifyCode(db, tenant.id, second.challengeId, { code: lastCode() }, META, at(MINUTE))).kind).toBe(
      "signed-in",
    );
  });

  it("depois de errar 5 vezes, o reenvio gera um código novo que funciona", async () => {
    const first = await signup();
    const wrong = wrongCode(lastCode());
    for (let i = 0; i < 5; i++) await verifyCode(db, tenant.id, first.challengeId, { code: wrong }, META, T0);

    const second = await resendCode(db, tenant.id, first.challengeId, { channel: "whatsapp" }, META, deps, at(MINUTE));

    if (second.kind !== "code-sent") throw new Error(`esperava code-sent, veio ${JSON.stringify(second)}`);
    expect((await verifyCode(db, tenant.id, second.challengeId, { code: lastCode() }, META, at(MINUTE))).kind).toBe(
      "signed-in",
    );
  });

  it("desafio já consumido não pode ser reenviado", async () => {
    const sent = await signup();
    await verifyCode(db, tenant.id, sent.challengeId, { code: lastCode() }, META, T0);

    expect(await resendCode(db, tenant.id, sent.challengeId, { channel: "sms" }, META, deps, at(MINUTE))).toEqual({
      kind: "error",
      error: EXPIRED,
      restart: false,
    });
  });

  it("bloqueado pelo limite, o desafio anterior continua valendo", async () => {
    // 3 envios em 15 min para o telefone: o 4º bloqueia.
    const first = await signup();
    const second = await resendCode(db, tenant.id, first.challengeId, { channel: "sms" }, META, deps, at(MINUTE));
    if (second.kind !== "code-sent") throw new Error("inesperado");
    const third = await resendCode(db, tenant.id, second.challengeId, { channel: "sms" }, META, deps, at(2 * MINUTE));
    if (third.kind !== "code-sent") throw new Error("inesperado");
    const thirdCode = lastCode();

    const blocked = await resendCode(db, tenant.id, third.challengeId, { channel: "sms" }, META, deps, at(3 * MINUTE));

    expect(blocked).toEqual({ kind: "error", error: LIMIT, restart: false });
    expect(messaging.sent).toHaveLength(3);
    expect((await challengeRow(third.challengeId)).invalidatedAt).toBeNull();
    const result = await verifyCode(db, tenant.id, third.challengeId, { code: thirdCode }, META, at(3 * MINUTE));
    expect(result.kind).toBe("signed-in");
  });
});

describe("falha do provedor", () => {
  it("invalida o desafio, devolve a mensagem de falha e não loga dado pessoal", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    messaging.state.fail = true;

    const result = await startSignup(db, tenant.id, SIGNUP, {}, META, deps, T0);

    expect(result).toEqual({ kind: "error", error: SEND_FAILED, restart: false });
    const rows = await db.select().from(otpCodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].invalidatedAt).toEqual(T0);

    expect(consoleError).toHaveBeenCalled();
    const logged = JSON.stringify(consoleError.mock.calls);
    for (const secret of [CPF, PHONE, NAME, "529.982.247-25", "98765-4321", "falha ao enviar para"]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("limite de envio", () => {
  it("o 4º envio em 15 min para o mesmo telefone é recusado", async () => {
    for (let i = 0; i < 3; i++) await signup(SIGNUP, at(i * MINUTE));

    const blocked = await startSignup(db, tenant.id, SIGNUP, {}, META, deps, at(3 * MINUTE));

    expect(blocked).toEqual({ kind: "error", error: LIMIT, restart: false });
    expect(messaging.sent).toHaveLength(3);
  });
});

describe("limite por IP antes de procurar o CPF", () => {
  // Envios do mesmo IP para telefones diferentes (o limite por telefone não entra), metade em
  // outra clínica: o limite por IP conta entre clínicas.
  async function sendsFromIp(total: number) {
    for (let i = 0; i < total; i++) {
      const tenantId = i % 2 === 0 ? tenant.id : otherTenant.id;
      const input = { ...SIGNUP, phone: `(11) 98765-43${String(i).padStart(2, "0")}` };
      const result = await startSignup(db, tenantId, input, {}, META, deps, at(i * MINUTE));
      if (result.kind !== "code-sent") throw new Error(`esperava code-sent, veio ${JSON.stringify(result)}`);
    }
  }

  it("com 10 envios em 15 min, todo CPF recebe a mesma mensagem de limite", async () => {
    await sendsFromIp(10);
    await insertPerson({ cpf: "11144477735" });
    const rowsBefore = (await db.select().from(otpCodes)).length;

    expect(await startEntry(db, tenant.id, { cpf: CPF }, META, deps, at(10 * MINUTE))).toEqual({
      kind: "error",
      error: LIMIT,
      restart: false,
    });
    expect(await startEntry(db, tenant.id, { cpf: "11144477735" }, META, deps, at(10 * MINUTE))).toEqual({
      kind: "error",
      error: LIMIT,
      restart: false,
    });
    // startSignup também procura o CPF: recusa antes disso, sem nem reservar um desafio.
    const insert = vi.spyOn(db, "insert");
    expect(await startSignup(db, tenant.id, SIGNUP, {}, META, deps, at(10 * MINUTE))).toEqual({
      kind: "error",
      error: LIMIT,
      restart: false,
    });
    expect(insert).not.toHaveBeenCalled();
    expect(await db.select().from(otpCodes)).toHaveLength(rowsBefore);
    expect(messaging.sent).toHaveLength(10);
  });

  it("outro IP não é afetado", async () => {
    await sendsFromIp(10);

    expect(await startEntry(db, tenant.id, { cpf: CPF }, { ...META, ip: "198.51.100.1" }, deps, at(10 * MINUTE))).toEqual({
      kind: "needs-signup",
      cpf: CPF,
    });
  });

  it("com 9 envios ainda funciona", async () => {
    await sendsFromIp(9);

    expect(await startEntry(db, tenant.id, { cpf: CPF }, META, deps, at(9 * MINUTE))).toEqual({
      kind: "needs-signup",
      cpf: CPF,
    });
  });

  it("janela estrita: o envio de exatamente 15 min atrás já não conta", async () => {
    await sendsFromIp(10);

    expect(await startEntry(db, tenant.id, { cpf: CPF }, META, deps, at(15 * MINUTE))).toEqual({
      kind: "needs-signup",
      cpf: CPF,
    });
  });
});

describe("concorrência", () => {
  it("dois verifyCode simultâneos com o código certo abrem uma sessão só", async () => {
    // Repete para dar chance à intercalação entre as duas requisições.
    for (let round = 0; round < 5; round++) {
      await resetDb();
      [tenant] = await db.insert(tenants).values({ slug: "easyglowcare", name: "EasyGlowCare" }).returning();
      messaging.sent.length = 0;

      const sent = await signup();
      const code = lastCode();

      const results = await Promise.all([
        verifyCode(db, tenant.id, sent.challengeId, { code }, META, T0),
        verifyCode(db, tenant.id, sent.challengeId, { code }, META, T0),
      ]);

      expect(results.filter((r) => r.kind === "signed-in")).toHaveLength(1);
      expect(results.filter((r) => r.kind === "error")).toEqual([{ kind: "error", error: EXPIRED, restart: false }]);
      expect(await db.select().from(personSessions)).toHaveLength(1);
      expect(await db.select().from(people)).toHaveLength(1);
    }
  });

  it("corrida de CPF com o mesmo telefone: o segundo entra na mesma pessoa", async () => {
    const first = await signup();
    const firstCode = lastCode();
    const second = await signup({ ...SIGNUP, name: "Maria S." });
    const secondCode = lastCode();

    const a = await verifyCode(db, tenant.id, first.challengeId, { code: firstCode }, META, T0);
    const b = await verifyCode(db, tenant.id, second.challengeId, { code: secondCode }, META, at(MINUTE));

    if (a.kind !== "signed-in" || b.kind !== "signed-in") throw new Error(`esperava dois signed-in: ${JSON.stringify([a, b])}`);
    expect(b.personId).toBe(a.personId);
    const rows = await db.select().from(people);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(NAME);
    expect(rows[0].phoneVerifiedAt).toEqual(at(MINUTE));
    expect(await db.select().from(personSessions)).toHaveLength(2);
  });

  it("corrida de CPF com telefone diferente: volta ao CPF e não cria nada", async () => {
    const first = await signup();
    const firstCode = lastCode();
    const second = await signup({ ...SIGNUP, phone: "(21) 98765-1234" });
    const secondCode = lastCode();

    await verifyCode(db, tenant.id, first.challengeId, { code: firstCode }, META, T0);
    const b = await verifyCode(db, tenant.id, second.challengeId, { code: secondCode }, META, T0);

    expect(b).toEqual({ kind: "error", error: CPF_TAKEN, restart: true });
    expect(await db.select().from(people)).toHaveLength(1);
    expect(await db.select().from(personSessions)).toHaveLength(1);
  });
});
