import { describe, expect, it } from "vitest";

import { parseStaffCreateArgs } from "./staff-create-args";

describe("parseStaffCreateArgs", () => {
  it("lê os quatro argumentos nomeados", () => {
    expect(
      parseStaffCreateArgs(["--tenant", "easyglowcare", "--name", "Maria Silva", "--email", "maria@x.com", "--role", "owner"]),
    ).toEqual({ tenant: "easyglowcare", name: "Maria Silva", email: "maria@x.com", role: "owner" });
  });

  it("lança o texto de uso quando falta um argumento", () => {
    expect(() => parseStaffCreateArgs(["--tenant", "x"])).toThrow(/Uso: pnpm staff:create/);
  });

  it("lança erro citando --role quando o papel é inválido", () => {
    expect(() =>
      parseStaffCreateArgs(["--tenant", "x", "--name", "n", "--email", "e@x.com", "--role", "admin"]),
    ).toThrow(/role/);
  });

  it("lança o texto de uso com a lista vazia", () => {
    expect(() => parseStaffCreateArgs([])).toThrow(/Uso: pnpm staff:create/);
  });
});
