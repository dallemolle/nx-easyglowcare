import { desc } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieOptions = Record<string, unknown>;

const request = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
  deleted: [] as Record<string, unknown>[],
  headers: new Map<string, string>(),
}));

const mocks = vi.hoisted(() => ({ redirect: vi.fn(), verifyCode: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      request.cookies.has(name) ? { name, value: request.cookies.get(name) } : undefined,
    set: (name: string, value: string, options: CookieOptions) => {
      request.cookies.set(name, value);
      request.options.set(name, options);
    },
    delete: (options: CookieOptions) => {
      request.cookies.delete(String(options.name));
      request.deleted.push(options);
    },
  }),
  headers: async () => ({ get: (name: string) => request.headers.get(name.toLowerCase()) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));
vi.mock("@/server/db/client", async () => {
  const { getTestDb } = await import("../../../../../test/db");
  return { db: getTestDb() };
});
// verifyCode real, embrulhado para saber se foi chamado (e poder forçar uma exceção).
vi.mock("@/server/auth/entry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/entry")>();
  mocks.verifyCode.mockImplementation(actual.verifyCode);
  return { ...actual, verifyCode: mocks.verifyCode };
});

import { getTestDb, resetDb } from "../../../../../test/db";
import { CLIENT_SESSION_COOKIE } from "@/server/auth/client-session";
import { OTP_COOKIE } from "@/server/auth/current-client";
import { signPayload, verifyPayload } from "@/server/auth/token";
import { otpCodes, tenants } from "@/server/db/schema";

import { resendCodeAction, startSignupAction, verifyCodeAction } from "./actions";

const db = getTestDb();
const SLUG = "easyglowcare";
const CPF = "52998224725";
const TEST_PHONE = "11900000001";
const GENERIC = "Não foi possível continuar. Tente novamente.";

async function signUpWithTestPhone() {
  const result = await startSignupAction(SLUG, {
    cpf: CPF,
    name: "Maria Teste",
    phone: TEST_PHONE,
    acceptTerms: true,
    marketing: false,
  });
  expect(result).toMatchObject({ ok: true, step: "code" });
}

describe("verifyCodeAction", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("OTP_TEST_PHONES", TEST_PHONE);
    request.cookies.clear();
    request.options.clear();
    request.deleted.length = 0;
    request.headers.clear();
    request.headers.set("x-forwarded-for", "203.0.113.7");
    request.headers.set("user-agent", "vitest");
    await db.insert(tenants).values([
      { slug: SLUG, name: "EasyGlowCare" },
      { slug: "outra-clinica", name: "Outra Clínica" },
    ]);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.redirect.mockClear();
    mocks.verifyCode.mockClear();
    consoleError.mockRestore();
  });

  it("com sucesso, redireciona para o destino seguro (//evil.com vira minha-conta)", async () => {
    await signUpWithTestPhone();

    await verifyCodeAction(SLUG, { code: "000000" }, "//evil.com");

    expect(mocks.redirect).toHaveBeenCalledWith("/easyglowcare/minha-conta");
  });

  it("grava egc_cliente com path da clínica, httpOnly e sameSite lax, e apaga egc_otp", async () => {
    await signUpWithTestPhone();
    expect(request.options.get(OTP_COOKIE)).toMatchObject({
      path: "/easyglowcare",
      httpOnly: true,
      sameSite: "lax",
    });

    await verifyCodeAction(SLUG, { code: "000000" }, null);

    expect(request.cookies.has(CLIENT_SESSION_COOKIE)).toBe(true);
    const options = request.options.get(CLIENT_SESSION_COOKIE);
    expect(options).toMatchObject({ path: "/easyglowcare", httpOnly: true, sameSite: "lax", secure: false });
    expect(options?.expires).toBeInstanceOf(Date);
    expect(request.cookies.has(OTP_COOKIE)).toBe(false);
    expect(request.deleted).toContainEqual(expect.objectContaining({ name: OTP_COOKIE, path: "/easyglowcare" }));
  });

  it("egc_otp emitido para outra clínica: restart sem consultar o código", async () => {
    request.cookies.set(
      OTP_COOKIE,
      await signPayload(
        { c: "9a1c2d6e-8f0a-4b3c-8f2b-3f2b8c1e5d4a", s: "outra-clinica" },
        new Date(Date.now() + 10 * 60 * 1000),
      ),
    );

    const result = await verifyCodeAction(SLUG, { code: "000000" }, null);

    expect(result).toMatchObject({ ok: false, restart: true });
    expect(mocks.verifyCode).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(request.cookies.has(CLIENT_SESSION_COOKIE)).toBe(false);
  });

  it("sem egc_otp: restart sem consultar o código", async () => {
    const result = await verifyCodeAction(SLUG, { code: "000000" }, null);

    expect(result).toMatchObject({ ok: false, restart: true });
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("clínica inexistente: mensagem genérica e restart", async () => {
    const result = await verifyCodeAction("nao-existe", { code: "000000" }, null);

    expect(result).toEqual({ ok: false, error: GENERIC, restart: true });
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("reenvio troca egc_otp pelo desafio novo, e o código entra com ele", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await signUpWithTestPhone();
      const first = await verifyPayload(request.cookies.get(OTP_COOKIE));

      vi.setSystemTime(Date.now() + 61_000);
      const resent = await resendCodeAction(SLUG, { channel: "sms" });

      expect(resent).toMatchObject({ ok: true, step: "code", channel: "sms" });
      const second = await verifyPayload(request.cookies.get(OTP_COOKIE));
      const [newest] = await db.select().from(otpCodes).orderBy(desc(otpCodes.createdAt)).limit(1);
      expect(second).toMatchObject({ c: newest.id, s: SLUG });
      expect(second?.c).not.toBe(first?.c);

      await verifyCodeAction(SLUG, { code: "000000" }, null);
      expect(mocks.redirect).toHaveBeenCalledWith("/easyglowcare/minha-conta");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exceção inesperada: mensagem genérica, sem redirecionar e sem CPF/telefone no log", async () => {
    await signUpWithTestPhone();
    mocks.verifyCode.mockRejectedValueOnce(
      new Error(`Failed query: insert ... params: ${CPF},${TEST_PHONE},203.0.113.7`),
    );

    const result = await verifyCodeAction(SLUG, { code: "000000" }, null);

    expect(result).toEqual({ ok: false, error: GENERIC, restart: false });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain(CPF);
    expect(logged).not.toContain(TEST_PHONE);
    expect(logged).not.toContain("Failed query");
  });
});
