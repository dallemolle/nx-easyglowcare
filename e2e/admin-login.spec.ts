import { expect, test } from "@playwright/test";

import { E2E_STAFF_PASSWORD } from "./global-setup";

const OWNER_EMAIL = "dono@easyglowcare.test";

test("sem login, /admin redireciona para o login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("senha errada mostra mensagem genérica", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("dono entra, vê o painel e sai", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Senha").fill(E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  const header = page.getByRole("banner");
  await expect(header.getByText("EasyGlowCare")).toBeVisible();
  await expect(header.getByText("Dono(a)")).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("logado, /admin/login redireciona para /admin", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Senha").fill(E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/admin$/);
});

test("/minha-conta mostra a página reservada", async ({ page }) => {
  await page.goto("/minha-conta");
  await expect(page.getByText("Em breve")).toBeVisible();
});
