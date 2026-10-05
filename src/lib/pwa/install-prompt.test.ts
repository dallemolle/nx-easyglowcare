import { afterEach, describe, expect, it, vi } from "vitest";

import { getInstallPrompt, setInstallPrompt, subscribe, type BeforeInstallPromptEvent } from "./install-prompt";

const fakeEvent = {} as BeforeInstallPromptEvent;

afterEach(() => setInstallPrompt(null));

describe("install-prompt", () => {
  it("começa vazio", () => {
    expect(getInstallPrompt()).toBeNull();
  });

  it("guarda o convite e avisa quem assina", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setInstallPrompt(fakeEvent);
    expect(getInstallPrompt()).toBe(fakeEvent);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("limpar avisa e esvazia", () => {
    setInstallPrompt(fakeEvent);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setInstallPrompt(null);
    expect(getInstallPrompt()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("quem cancelou a assinatura não é mais avisado", () => {
    const listener = vi.fn();
    subscribe(listener)();
    setInstallPrompt(fakeEvent);
    expect(listener).not.toHaveBeenCalled();
  });
});
