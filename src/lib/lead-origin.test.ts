import { describe, expect, it } from "vitest";

import { originCookieFor, parseOriginCookie, resolveLeadSource } from "./lead-origin";

describe("resolveLeadSource", () => {
  it("segue a tabela da seção 4.3, na ordem", () => {
    expect(resolveLeadSource({ ref: "ana", utm_source: "instagram" })).toBe("referral");
    expect(resolveLeadSource({ utm_source: "Instagram" })).toBe("instagram");
    expect(resolveLeadSource({ utm_source: "IG" })).toBe("instagram");
    expect(resolveLeadSource({ utm_source: "google-ads" })).toBe("google");
    expect(resolveLeadSource({})).toBe("direct");
    expect(resolveLeadSource({ utm_campaign: "x" })).toBe("other");
  });
});

describe("originCookieFor", () => {
  const sp = new URLSearchParams("utm_source=instagram&foo=1");

  it("grava só os parâmetros de origem, com path na clínica", () => {
    expect(originCookieFor("/easyglowcare", sp, false)).toEqual({
      path: "/easyglowcare",
      value: JSON.stringify({ utm_source: "instagram" }),
    });
    expect(originCookieFor("/easyglowcare/termos", sp, false)?.path).toBe("/easyglowcare");
  });

  it("o primeiro toque vence", () => {
    expect(originCookieFor("/easyglowcare", sp, true)).toBeNull();
  });

  it("ignora endereço sem parâmetros de origem", () => {
    expect(originCookieFor("/easyglowcare", new URLSearchParams("foo=1"), false)).toBeNull();
  });

  it("ignora /admin, a raiz e slug inválido", () => {
    expect(originCookieFor("/admin", sp, false)).toBeNull();
    expect(originCookieFor("/admin/login", sp, false)).toBeNull();
    expect(originCookieFor("/", sp, false)).toBeNull();
    expect(originCookieFor("/Easy Glow", sp, false)).toBeNull();
    expect(originCookieFor(`/${"a".repeat(64)}`, sp, false)).toBeNull();
  });

  it("corta cada valor em 100 caracteres", () => {
    const cookie = originCookieFor("/a", new URLSearchParams(`ref=${"x".repeat(300)}`), false);
    expect(JSON.parse(cookie!.value).ref).toHaveLength(100);
  });
});

describe("parseOriginCookie", () => {
  it("devolve {} para valor ausente ou inválido", () => {
    expect(parseOriginCookie(undefined)).toEqual({});
    expect(parseOriginCookie("nao-json")).toEqual({});
    expect(parseOriginCookie(JSON.stringify({ utm_source: 5 }))).toEqual({});
    expect(parseOriginCookie(JSON.stringify(["x"]))).toEqual({});
  });

  it("descarta chaves desconhecidas", () => {
    expect(parseOriginCookie(JSON.stringify({ ref: "ana", outro: "x" }))).toEqual({ ref: "ana" });
  });
});
