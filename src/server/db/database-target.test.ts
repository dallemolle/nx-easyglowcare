import { describe, expect, it } from "vitest";

import { describeDatabaseTarget } from "./database-target";

describe("describeDatabaseTarget", () => {
  it("devolve só o hostname, sem usuário, senha, porta nem banco", () => {
    const url = "postgres://dono:segredo-123@ep-xxxx.sa-east-1.aws.neon.tech:5432/neondb?sslmode=require";
    const target = describeDatabaseTarget(url);
    expect(target).toBe("ep-xxxx.sa-east-1.aws.neon.tech");
    expect(target).not.toContain("segredo-123");
    expect(target).not.toContain("dono");
  });

  it("URL inválida lança erro cuja mensagem não contém a URL", () => {
    const invalid = "isto-nao-e-url-com-segredo-xyz";
    let message = "";
    try {
      describeDatabaseTarget(invalid);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("segredo-xyz");
    expect(message).not.toContain(invalid);
  });
});
