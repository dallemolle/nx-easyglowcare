import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

import { SECURITY_HEADERS } from "./headers";

describe("cabeçalhos de segurança fixos", () => {
  it("têm os valores da spec", () => {
    expect(Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key, h.value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    });
  });

  it("o next.config aplica os cabeçalhos a todas as rotas e o sw.js sai sem cache", async () => {
    const rules = await nextConfig.headers!();

    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(SECURITY_HEADERS);

    const sw = rules.find((rule) => rule.source === "/sw.js");
    expect(sw?.headers).toContainEqual({ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" });
  });
});
