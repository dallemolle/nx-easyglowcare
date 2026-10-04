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
