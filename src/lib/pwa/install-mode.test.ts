import { describe, expect, it } from "vitest";

import { detectInstallMode } from "./install-mode";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const base = { standalone: false, canPrompt: false, userAgent: ANDROID, maxTouchPoints: 5 };

describe("detectInstallMode", () => {
  it("já instalado vence tudo", () => {
    expect(detectInstallMode({ ...base, standalone: true, canPrompt: true, userAgent: IPHONE })).toBe("installed");
  });

  it("navegador ofereceu a instalação → botão", () => {
    expect(detectInstallMode({ ...base, canPrompt: true })).toBe("prompt");
  });

  it("iPhone → passo a passo do Safari", () => {
    expect(detectInstallMode({ ...base, userAgent: IPHONE })).toBe("ios");
  });

  it("iPad em modo computador (Macintosh com toque) → passo a passo do Safari", () => {
    expect(detectInstallMode({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5 })).toBe("ios");
  });

  it("Mac de verdade (sem toque) → instrução genérica", () => {
    expect(detectInstallMode({ ...base, userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 })).toBe("other");
  });

  it("Android sem oferta do navegador → instrução genérica", () => {
    expect(detectInstallMode(base)).toBe("other");
  });
});
