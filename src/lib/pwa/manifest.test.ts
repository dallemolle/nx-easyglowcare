import { describe, expect, it } from "vitest";

import { APP_ICONS, PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "./constants";
import { buildPanelManifest, buildTenantManifest } from "./manifest";

describe("buildTenantManifest", () => {
  it("usa o nome da clínica e abre na página dela", () => {
    expect(buildTenantManifest({ slug: "easyglowcare", name: "EasyGlowCare" })).toEqual({
      id: "/easyglowcare",
      name: "EasyGlowCare",
      short_name: "EasyGlowCare",
      start_url: "/easyglowcare",
      scope: "/easyglowcare",
      display: "standalone",
      lang: "pt-BR",
      background_color: PWA_BACKGROUND_COLOR,
      theme_color: PWA_THEME_COLOR,
      icons: [...APP_ICONS],
    });
  });

  it("cada clínica tem seu próprio app", () => {
    expect(buildTenantManifest({ slug: "outra", name: "Outra" }).id).toBe("/outra");
  });
});

describe("buildPanelManifest", () => {
  it("é o app do painel, separado das clínicas", () => {
    expect(buildPanelManifest()).toMatchObject({
      id: "/admin",
      name: "EasyGlowCare Painel",
      short_name: "Painel",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      lang: "pt-BR",
    });
  });
});

describe("APP_ICONS", () => {
  it("tem 192, 512 e 512 maskable", () => {
    expect(APP_ICONS.map((icon) => [icon.src, icon.sizes, icon.purpose])).toEqual([
      ["/icons/icon-192.png", "192x192", "any"],
      ["/icons/icon-512.png", "512x512", "any"],
      ["/icons/maskable-512.png", "512x512", "maskable"],
    ]);
  });
});
