import { describe, expect, it } from "vitest";
import {
  pendingSignupSchema,
  resendSchema,
  signupSchema,
  startEntrySchema,
  verifyCodeSchema,
} from "./entry";

const valid = {
  cpf: "529.982.247-25",
  name: "  Maria Silva ",
  phone: "(11) 98765-4321",
  acceptTerms: true,
  marketing: true,
};

describe("entry schemas", () => {
  it("startEntry normaliza e valida CPF", () => {
    expect(startEntrySchema.parse({ cpf: "529.982.247-25" })).toEqual({ cpf: "52998224725" });
    expect(startEntrySchema.safeParse({ cpf: "529.982.247-24" }).error?.issues[0].message).toBe(
      "CPF inválido. Confira os números.",
    );
  });

  it("signup normaliza campos", () => {
    expect(signupSchema.parse(valid)).toEqual({
      cpf: "52998224725",
      name: "Maria Silva",
      phone: "11987654321",
      acceptTerms: true,
      marketing: true,
    });
  });

  it("signup valida nome", () => {
    expect(signupSchema.safeParse({ ...valid, name: "A" }).error?.issues[0].message).toBe("Informe seu nome.");
    expect(signupSchema.safeParse({ ...valid, name: "A".repeat(101) }).error?.issues[0].message).toBe(
      "Use no máximo 100 caracteres.",
    );
  });

  it("signup valida celular e termos", () => {
    expect(signupSchema.safeParse({ ...valid, phone: "(11) 8765-4321" }).error?.issues[0].message).toBe(
      "Informe um celular com DDD, como (11) 98765-4321.",
    );
    expect(signupSchema.safeParse({ ...valid, acceptTerms: false }).error?.issues[0].message).toBe(
      "Para continuar, aceite os Termos de Uso e a Política de Privacidade.",
    );
  });

  it("marketing ausente vira false", () => {
    const { marketing: _m, ...rest } = valid;
    void _m;
    expect(signupSchema.parse(rest).marketing).toBe(false);
  });

  it("verifyCode", () => {
    expect(verifyCodeSchema.parse({ code: "123 456" })).toEqual({ code: "123456" });
    expect(verifyCodeSchema.safeParse({ code: "12345" }).error?.issues[0].message).toBe(
      "Digite os 6 números do código.",
    );
    expect(verifyCodeSchema.safeParse({ code: "1234567" }).success).toBe(false);
  });

  it("resend aceita só whatsapp e sms", () => {
    expect(resendSchema.safeParse({ channel: "email" }).success).toBe(false);
    expect(resendSchema.parse({ channel: "sms" })).toEqual({ channel: "sms" });
  });

  it("pendingSignup", () => {
    const ok = {
      name: "Maria",
      cpf: "52998224725",
      phone: "11987654321",
      marketing: false,
      termsVersion: "v1",
      origin: { utm_source: "instagram" },
    };
    expect(pendingSignupSchema.parse(ok)).toEqual(ok);
    expect(pendingSignupSchema.safeParse({ ...ok, origin: { utm_source: 1 } }).success).toBe(false);
  });
});
