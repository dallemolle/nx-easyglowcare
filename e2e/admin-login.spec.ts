import { expect, test, type Page } from "@playwright/test";

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

// Antes de hidratar, um envio nativo sem method mandaria e-mail e senha na URL (GET).
test("formulário de login envia por POST", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
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

const RECEPTION_EMAIL = "recepcao@easyglowcare.test";
const NEW_PERSON_NAME = "Pessoa E2E";
const NEW_PERSON_PASSWORD = "e2e-nova-senha-2";

async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}

async function createStaffPerson(page: Page, name: string, email: string, roleLabel: string) {
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Papel", { exact: true }).click();
  await page.getByRole("option", { name: roleLabel }).click();
  await page.getByRole("button", { name: "Cadastrar" }).click();
}

// Os testes 6 e 9 dependem da pessoa criada no primeiro: rodam em série, com e-mail único
// por execução (o banco de dev persiste entre execuções).
test.describe.serial("gestão da equipe", () => {
  const newEmail = `e2e-${Date.now()}@easyglowcare.test`;

  test("dono cadastra pessoa e ela é obrigada a trocar a senha", async ({ page }) => {
    await login(page, OWNER_EMAIL, E2E_STAFF_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await page.getByRole("link", { name: "Equipe" }).click();
    await expect(page).toHaveURL(/\/admin\/equipe$/);

    await createStaffPerson(page, NEW_PERSON_NAME, newEmail, "Recepção");

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Anote agora: ela não será mostrada de novo.")).toBeVisible();
    // Escape não pode fechar: a senha só aparece uma vez.
    await page.keyboard.press("Escape");
    await expect(dialog.getByTestId("temporary-password")).toBeVisible();
    const temporaryPassword = (await dialog.getByTestId("temporary-password").textContent())?.trim();
    expect(temporaryPassword).toBeTruthy();
    await dialog.getByRole("button", { name: "Fechar" }).first().click();
    await expect(dialog).toBeHidden();

    await logout(page);

    await login(page, newEmail, temporaryPassword!);
    await expect(page).toHaveURL(/\/admin\/trocar-senha$/);
    await expect(page.getByText("Crie uma senha sua para continuar.")).toBeVisible();
    const changeForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Salvar nova senha" }) });
    await expect(changeForm).toHaveAttribute("method", "post");

    // Portão da troca obrigatória: nem o painel nem a equipe abrem enquanto a senha for provisória.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/trocar-senha$/);
    await page.goto("/admin/equipe");
    await expect(page).toHaveURL(/\/admin\/trocar-senha$/);

    // Quem está preso na troca obrigatória também consegue sair.
    await logout(page);
    await login(page, newEmail, temporaryPassword!);
    await expect(page).toHaveURL(/\/admin\/trocar-senha$/);

    await page.getByLabel("Senha atual", { exact: true }).fill(temporaryPassword!);
    await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PERSON_PASSWORD);
    await page.getByLabel("Confirmar nova senha").fill(NEW_PERSON_PASSWORD);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("banner").getByText("Recepção")).toBeVisible();
  });

  test("dono desativa pessoa e ela perde o acesso", async ({ page }) => {
    await login(page, OWNER_EMAIL, E2E_STAFF_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/equipe");

    const card = page.getByTestId("staff-card").filter({ hasText: newEmail });
    await card.getByRole("button", { name: "Desativar" }).click();
    await expect(card.getByText("Desativado")).toBeVisible();
    await expect(card.getByRole("button", { name: "Reativar" })).toBeVisible();

    await logout(page);

    await login(page, newEmail, NEW_PERSON_PASSWORD);
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test("e-mail repetido mostra mensagem", async ({ page }) => {
  await login(page, OWNER_EMAIL, E2E_STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/equipe");

  await createStaffPerson(page, "Outra Pessoa", RECEPTION_EMAIL, "Recepção");

  await expect(page.getByText("Este e-mail já está em uso.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("recepção recebe 404 em /admin/equipe", async ({ page }) => {
  await login(page, RECEPTION_EMAIL, E2E_STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Equipe" })).toHaveCount(0);

  const response = await page.goto("/admin/equipe");
  expect(response?.status()).toBe(404);
});
