import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consoleMessagingProvider } from "./console";
import { getMessagingProvider } from "./index";

describe("getMessagingProvider", () => {
  it("devolve o console por padrão e por nome", () => {
    expect(getMessagingProvider()).toBe(consoleMessagingProvider);
    expect(getMessagingProvider("console").name).toBe("console");
  });

  it("valor desconhecido lança erro com o nome da variável", () => {
    expect(() => getMessagingProvider("twilio")).toThrow(/MESSAGING_PROVIDER/);
  });
});

describe("consoleMessagingProvider", () => {
  let info: ReturnType<typeof vi.spyOn>;
  const logged = () => info.mock.calls.flat().map(String).join(" ");

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    info.mockRestore();
  });

  it("sendTemplate loga canal, modelo e destinatário mascarado, sem o payload", async () => {
    const result = await consoleMessagingProvider.sendTemplate({
      channel: "whatsapp",
      recipient: "11987651234",
      template: "appointment.reminder_24h",
      payload: { nome: "Marina Segredo" },
    });

    expect(result.providerMessageId).toMatch(/^console-/);
    expect(logged()).toContain("whatsapp");
    expect(logged()).toContain("appointment.reminder_24h");
    expect(logged()).toContain("*******1234");
    expect(logged()).not.toContain("11987651234");
    expect(logged()).not.toContain("Marina Segredo");
  });

  it("sendOtp mostra o código fora de produção", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await consoleMessagingProvider.sendOtp({ channel: "sms", recipient: "11987651234", code: "482913" });
    expect(logged()).toContain("482913");
    expect(logged()).not.toContain("11987651234");
  });

  it("sendOtp nunca mostra o código em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await consoleMessagingProvider.sendOtp({ channel: "sms", recipient: "11987651234", code: "482913" });
    expect(logged()).not.toContain("482913");
  });

  it("cada envio devolve um id diferente", async () => {
    const input = { channel: "email" as const, recipient: "m@x.test", template: "t", payload: {} };
    const a = await consoleMessagingProvider.sendTemplate(input);
    const b = await consoleMessagingProvider.sendTemplate(input);
    expect(a.providerMessageId).not.toBe(b.providerMessageId);
  });
});
