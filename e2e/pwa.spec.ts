import { expect, test } from "./fixtures";

test("a página da clínica aponta para o app da clínica", async ({ page, request }) => {
  await page.goto("/easyglowcare");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/easyglowcare/manifest.webmanifest");

  const manifest = await (await request.get("/easyglowcare/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "EasyGlowCare", start_url: "/easyglowcare", scope: "/easyglowcare" });
});

test("o login do painel aponta para o app do painel, que abre sem sessão", async ({ page, request }) => {
  await page.goto("/admin/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/admin/manifest.webmanifest");

  const response = await request.get("/admin/manifest.webmanifest", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ name: "EasyGlowCare Painel", start_url: "/admin" });
});

test("manifest de clínica inexistente dá 404", async ({ request }) => {
  expect((await request.get("/nao-existe/manifest.webmanifest")).status()).toBe(404);
});
