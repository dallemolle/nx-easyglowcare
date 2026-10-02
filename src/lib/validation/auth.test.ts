import { describe, expect, it } from "vitest";

import { changePasswordSchema, emailSchema, loginSchema, passwordSchema } from "./auth";

describe("emailSchema", () => {
  it("remove espaços e normaliza para minúsculas", () => {
    expect(emailSchema.parse(" Dono@EasyGlowCare.TEST ")).toBe("dono@easyglowcare.test");
  });

  it("rejeita e-mail sem arroba", () => {
    expect(emailSchema.safeParse("sem-arroba").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("rejeita menos de 10 caracteres", () => {
    const result = passwordSchema.safeParse("a".repeat(9));
    expect(result.success).toBe(false);
  });

  it("aceita exatamente 10 caracteres", () => {
    expect(passwordSchema.safeParse("a".repeat(10)).success).toBe(true);
  });

  it("aceita exatamente 128 caracteres", () => {
    expect(passwordSchema.safeParse("a".repeat(128)).success).toBe(true);
  });

  it("rejeita mais de 128 caracteres", () => {
    expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("aceita e-mail e senha válidos", () => {
    expect(loginSchema.safeParse({ email: "dono@easyglowcare.test", password: "qualquer" }).success).toBe(
      true,
    );
  });
});

describe("changePasswordSchema", () => {
  it("rejeita quando a nova senha é igual à atual", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "mesmasenha1",
      newPassword: "mesmasenha1",
    });
    expect(result.success).toBe(false);
  });

  it("aceita quando a nova senha é diferente da atual", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "senhaatual1",
      newPassword: "senhanova1",
    });
    expect(result.success).toBe(true);
  });
});
