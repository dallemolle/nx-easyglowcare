# Fase 0C: pontos menores adiados pelas revisões

Registrados nas revisões por tarefa e na revisão final do branch `feat/fase-0c-outbox-audit`.
Nenhum bloqueia o merge. A revisão final classificou todos como "pode esperar".

## Antes da Etapa 4 (lembretes)

Os dois primeiros já estão no ROADMAP: "Robustez da fila antes dos lembretes" e "Guarda das
mensagens que falharam".

**Fila (`src/server/jobs/outbox.ts`)**
- Um erro de banco ao concluir uma mensagem interrompe o lote inteiro. As demais ficam `sending` até
  a reserva expirar, com uma tentativa gasta.
- Não há limite de tempo por envio nem por execução. Com 50 envios em sequência e `maxDuration = 60`,
  um provedor lento derruba a função.
- Uma execução interrompida gasta uma tentativa de cada mensagem reservada que não foi enviada, porque
  a reserva já soma `attempts + 1` no começo.
- Mensagens `failed` guardam destinatário e conteúdo para sempre.

**Enfileiramento**
- `enqueueMessage` relança o erro do driver sem tratar. A mensagem desse erro contém o destinatário,
  então quem chamar precisa logar com `describeUnexpectedError`.

**Validação e erros**
- `recipient` aceita no máximo 254 caracteres, o que não cabe um endpoint de Web Push (0D).
- `describeUnexpectedError` só lê `cause.code`. SDKs de provedor costumam pôr o código no próprio
  erro.

**Provedor `console`**
- O código OTP fica oculto sempre que `NODE_ENV=production`, o que inclui staging.

## Testes a reforçar

**Fila**
- Não há teste para a retomada de uma reserva expirada que já está com `attempts ≥ 5`. O código foi
  conferido à mão e está correto.
- O teste do caminho `failed` não confere o `lastError`.
- Quando a proteção `SKIP LOCKED` é removida, o teste correspondente falha por tempo esgotado e deixa
  o lock aberto para o teste seguinte.

**Auditoria**
- O teste "nunca lança" de `recordStaffAudit` não exercita o `try/catch` da própria função. Para
  isso, falta um caso em que `headers()` rejeita.
- Nenhum teste no nível das actions garante que a senha provisória sobrevive a uma falha da
  auditoria. A garantia hoje é só "a auditoria nunca lança".

**Limpeza**
- O teste "loga só as contagens" confere apenas que o log contém `login_attempts=0`.

**Cron**
- O teste da rota "sem `CRON_SECRET`" não pega a remoção da checagem `!secret`. Só o teste unitário
  de `isAuthorizedCron` pega.

## Código

**Auditoria**
- `signOut` lê o IP (`headers()`) depois de `revokeSession` e fora de qualquer `try`.
- A linha de log "[audit] falha ao registrar" aparece em dobro: em `current.ts` e em `audit.ts`.
- Uma mudança de papel para o mesmo papel, ou reativar quem já está ativo, é auditada como mudança
  real.
- Se `ensureProfessionalLink` falhar depois de trocar o papel, a troca fica sem auditoria. Isso
  depende do item de transações no `tenantScope` do ROADMAP.

**Cron**
- `handleCronRequest` chama `isAuthorizedCron` (que lê `getEnv()`) fora do `try`. Com o ambiente
  inválido, a rota rejeita em vez de devolver o 500 controlado. Mesmo assim ela continua fechada.

**Limpeza**
- `cleanupOldData` usa `DELETE … RETURNING id` sem limite. Com volume grande, conte as linhas ou
  apague em lotes.

**Pagamento**
- `parseWebhook` do `mock` ignora os cabeçalhos, embora a interface diga que ele valida a assinatura.
  Falta um comentário avisando isso.

**Cosméticos**
- `env.ts` repete o pré-processamento de "vazio vira ausente" na linha do `CRON_SECRET`.
- Os títulos dos testes de webhook mostram o JSON cru.
