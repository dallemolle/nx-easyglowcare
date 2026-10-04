import { E2E_STAFF_PASSWORD } from "./constants";
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

test.describe("tela de instalar da clínica", () => {
  test("a página da clínica tem o link discreto e a tela explica como instalar", async ({ page }) => {
    await page.goto("/easyglowcare");
    await page.getByRole("link", { name: "Instalar app" }).click();

    await expect(page).toHaveURL(/\/easyglowcare\/instalar$/);
    await expect(page.getByRole("heading", { name: "Instalar o app" })).toBeVisible();
    await expect(page.getByText("Você também pode continuar usando pelo navegador, sem instalar.")).toBeVisible();
    // D12: nada de janela pedindo para instalar.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clínica inexistente dá 404", async ({ page }) => {
    const response = await page.goto("/nao-existe/instalar");
    expect(response?.status()).toBe(404);
  });
});

test.describe("tela de instalar no iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  test("mostra o passo a passo do Safari", async ({ page }) => {
    await page.goto("/easyglowcare/instalar");
    await expect(page.getByText("Adicionar à Tela de Início")).toBeVisible();
  });
});

test("o painel tem a tela de instalar", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill("dono@easyglowcare.test");
  await page.getByLabel("Senha").fill(E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("link", { name: "Instalar o painel no celular" }).click();
  await expect(page).toHaveURL(/\/admin\/instalar$/);
  await expect(page.getByRole("heading", { name: "Instalar o painel" })).toBeVisible();
});

test("o convite do navegador, disparado antes da tela, chega ao botão Instalar", async ({ page }) => {
  await page.goto("/easyglowcare");
  // O Chrome dispara o evento logo após o load, antes de abrirem a tela de instalar. Espera a
  // hidratação, quando o registrador no layout já escuta o evento.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) });
    window.dispatchEvent(event);
  });

  await page.getByRole("link", { name: "Instalar app" }).click(); // navegação no cliente
  await expect(page).toHaveURL(/\/easyglowcare\/instalar$/);
  await page.getByRole("button", { name: "Instalar", exact: true }).click();
  await expect(page.getByText("já está instalado")).toBeVisible();
});
