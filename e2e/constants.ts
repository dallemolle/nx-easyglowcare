// Compartilhado entre o global-setup e os specs. Não importa nada de src/server/auth: session.ts
// começa com `import "server-only"`, que lança fora do ambiente de Server Components do Next
// (e os specs rodam sob o runner puro do Playwright, sem essa condição de resolução).

/** Senha da equipe de exemplo usada só nesta execução do e2e (ver global-setup.ts). */
export const E2E_STAFF_PASSWORD = "e2e-senha-forte-1";

/** = SESSION_COOKIE em src/server/auth/session.ts. Duplicado pelo mesmo motivo acima. */
export const SESSION_COOKIE_NAME = "egc_session";
