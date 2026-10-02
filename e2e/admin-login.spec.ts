import { expect, test } from "@playwright/test";

import { E2E_STAFF_PASSWORD, SESSION_COOKIE_NAME } from "./constants";

const OWNER_EMAIL = "dono@easyglowcare.test";

test("sem login, /admin redireciona para o login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

// Sem isto, "sem cookie" é o único caso coberto, e o atalho do proxy.ts (que só checa
// PRESENÇA do cookie, não validade) seria suficiente para passar sozinho — nunca exercitaria
// `requireStaff`/`validateSession`. Um cookie com qualquer valor ainda precisa ser rejeitado.
test("cookie de sessão inválido também redireciona para o login", async ({ page, context }) => {
  await context.addCookies([
    { name: SESSION_COOKIE_NAME, value: "lixo-nao-e-um-jwt-valido", domain: "localhost", path: "/" },
  ]);

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

test("dono entra, vê o painel e sai", async ({ page, context }) => {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(OWNER_EMAIL);
  await page.getByLabel("Senha").fill(E2E_STAFF_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  const header = page.getByRole("banner");
  await expect(header.getByText("EasyGlowCare")).toBeVisible();
  await expect(header.getByText("Dono(a)")).toBeVisible();

  // Guarda o cookie de ANTES do logout: reinseri-lo depois prova que o logout revogou a
  // sessão no banco (`revoked_at`), não só que apagou o cookie do navegador.
  const cookiesBeforeLogout = await context.cookies();
  const sessionCookie = cookiesBeforeLogout.find((c) => c.name === SESSION_COOKIE_NAME);
  if (!sessionCookie) throw new Error("Cookie de sessão não encontrado antes do logout.");

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);

  // Pina a revogação: o MESMO cookie que funcionava antes do logout não pode mais autenticar.
  await context.addCookies([sessionCookie]);
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
