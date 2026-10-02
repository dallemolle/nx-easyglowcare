/**
 * Devolve só o hostname de uma URL de banco, para mostrar ao operador onde um script vai
 * escrever. Nunca devolve usuário, senha, porta nem nome do banco. Em URL inválida lança um
 * erro SEM a URL na mensagem (ela pode conter a senha).
 */
export function describeDatabaseTarget(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL_UNPOOLED não é uma URL válida.");
  }
}
