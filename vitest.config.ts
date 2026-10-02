import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    // Os specs do Playwright (e2e/**) não são testes do Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // client.ts valida DATABASE_URL ao ser importado; nos testes o pool Neon nunca é usado.
    env: {
      DATABASE_URL: "postgres://postgres:postgres@db.localtest.me:5432/easyglowcare_test",
      SESSION_SECRET: "test-session-secret-0123456789abcdef",
    },
    // Os testes de banco compartilham o mesmo Postgres de teste.
    fileParallelism: false,
  },
});
