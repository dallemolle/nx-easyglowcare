// Compartilhado entre o global-setup e os specs. Não importa nada de src/server/auth: session.ts
// começa com `import "server-only"`, que lança fora do ambiente de Server Components do Next
// (e os specs rodam sob o runner puro do Playwright, sem essa condição de resolução).

/** Senha da equipe de exemplo usada só nesta execução do e2e (ver global-setup.ts). */
export const E2E_STAFF_PASSWORD = "e2e-senha-forte-1";

/** = SESSION_COOKIE em src/server/auth/session.ts. Duplicado pelo mesmo motivo acima. */
export const SESSION_COOKIE_NAME = "egc_session";

/** Celular de teste (precisa estar em OTP_TEST_PHONES): o código é sempre 000000 e vai só ao console. */
export const E2E_TEST_PHONE = "11900000001";

/** CPF válido, usado pelo cadastro do e2e e removido pelo global-setup antes de cada execução. */
export const E2E_NEW_CPF = "52998224725";

/** = CLIENT_SESSION_COOKIE em src/server/auth/client-session.ts. Duplicado pelo mesmo motivo acima. */
export const CLIENT_COOKIE_NAME = "egc_cliente";
