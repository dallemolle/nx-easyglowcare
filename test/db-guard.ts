/**
 * A suíte migra e trunca o banco de teste. Para nunca apagar dados reais por engano
 * (ex.: TEST_DATABASE_URL apontando para o Neon), só aceita bancos cujo nome termina em `_test`.
 */
export function assertTestDatabase(url: string): void {
  const { hostname, pathname } = new URL(url);
  const database = decodeURIComponent(pathname.replace(/^\//, ""));
  if (!database.endsWith("_test")) {
    throw new Error(
      `Testes recusados: ${hostname}/${database} não é um banco de teste (o nome deve terminar em _test).`,
    );
  }
}
