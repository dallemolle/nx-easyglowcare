import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/server/auth/current", () => ({ signIn: mocks.signIn }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { loginAction } from "./actions";

const GENERIC = { error: "Não foi possível entrar. Tente novamente." };

describe("loginAction", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleError.mockRestore();
  });

  it("signIn rejeitando: devolve mensagem genérica, não lança e não loga e-mail, IP nem SQL", async () => {
    mocks.signIn.mockRejectedValue(
      new Error("Failed query: select ... params: fulano@x.test,203.0.113.7"),
    );

    await expect(loginAction({ email: "fulano@x.test", password: "x" })).resolves.toEqual(GENERIC);

    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("fulano@x.test");
    expect(logged).not.toContain("203.0.113.7");
    expect(logged).not.toContain("Failed query");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("signIn devolvendo erro: repassa esse erro", async () => {
    mocks.signIn.mockResolvedValue({ ok: false, error: "E-mail ou senha incorretos." });

    await expect(loginAction({})).resolves.toEqual({ error: "E-mail ou senha incorretos." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("mustChangePassword true: redireciona para /admin/trocar-senha", async () => {
    mocks.signIn.mockResolvedValue({ ok: true, mustChangePassword: true });
    await loginAction({});
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/trocar-senha");
  });

  it("mustChangePassword false: redireciona para /admin", async () => {
    mocks.signIn.mockResolvedValue({ ok: true, mustChangePassword: false });
    await loginAction({});
    expect(mocks.redirect).toHaveBeenCalledWith("/admin");
  });
});
