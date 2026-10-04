import { describe, expect, it } from "vitest";

import { buildCsp, type CspOptions } from "./csp";

const PROD: CspOptions = { nonce: "abc123", isDev: false, isPreview: false, upgradeInsecureRequests: true };

function directives(csp: string): Map<string, string> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("buildCsp", () => {
  it("produção: só scripts do próprio site com o nonce", () => {
    const d = directives(buildCsp(PROD));

    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(d.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(d.get("img-src")).toBe("'self' data: blob:");
    expect(d.get("font-src")).toBe("'self'");
    expect(d.get("connect-src")).toBe("'self'");
    expect(d.get("manifest-src")).toBe("'self'");
    expect(d.get("worker-src")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
    expect(d.has("upgrade-insecure-requests")).toBe(true);
    expect(d.has("frame-src")).toBe(false);
  });

  it("nunca libera unsafe-inline para scripts nem unsafe-eval fora de desenvolvimento", () => {
    const csp = buildCsp(PROD);
    expect(directives(csp).get("script-src")).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("desenvolvimento: libera eval e websocket da atualização automática", () => {
    const d = directives(buildCsp({ ...PROD, isDev: true }));

    expect(d.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'");
    expect(d.get("connect-src")).toBe("'self' ws:");
  });

  it("upgrade-insecure-requests só quando pedido", () => {
    expect(directives(buildCsp({ ...PROD, upgradeInsecureRequests: false })).has("upgrade-insecure-requests")).toBe(false);
  });

  it("Preview: libera vercel.live para a barra de comentários; produção não", () => {
    const preview = directives(buildCsp({ ...PROD, isPreview: true }));

    expect(preview.get("script-src")).toContain("https://vercel.live");
    expect(preview.get("connect-src")).toContain("https://vercel.live");
    expect(preview.get("img-src")).toContain("https://vercel.live");
    expect(preview.get("frame-src")).toBe("https://vercel.live");
    expect(buildCsp(PROD)).not.toContain("vercel.live");
  });

  it("o nonce entra só em script-src", () => {
    const csp = buildCsp({ ...PROD, nonce: "NONCE-UNICO" });
    expect(csp.match(/NONCE-UNICO/g)).toHaveLength(1);
  });
});
