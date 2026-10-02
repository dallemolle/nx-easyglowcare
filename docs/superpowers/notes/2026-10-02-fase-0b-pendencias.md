# Fase 0B: pontos menores adiados pelas revisões

Lista bruta dos achados de severidade menor que as revisões por tarefa e a revisão final deixaram sem correção.
As dívidas que precisam de decisão já viraram linhas no `ROADMAP.md` (seção "Recomendados").
A revisão final classificou 23 destes como descartáveis (cosméticos ou já cobertos); os demais são backlog.

- **Task 1:** commit atribui "Claude Sonnet 5" (o subagente rodou em sonnet; atribuição correta para quem escreveu)
- **Task 1:** sem teste positivo de login_attempts com tenant_id NULL (será exercitado pelos testes de login da T5)
- **Task 2+3:** ARGON2_OPTIONS sem `satisfies Options`
- **Task 2+3:** permissions.test.ts tem dois testes além do brief (ROLE_LABELS, chaves de ROLE_PERMISSIONS)
- **Task 4:** revokeUserSessions sobrescreve revokedAt de sessões já revogadas (falta isNull(revokedAt))
- **Task 4:** renewSession devolve nova expiração mesmo sem linha atualizada (sessão inexistente/revogada)
- **Task 4:** renewSession/revokeSession escrevem por sessionId com db cru, sem filtro de tenant (plano manda; chamadores só podem passar o id vindo de validateSession)
- **Task 4:** StaffSession.user inclui passwordHash — tarefas seguintes não podem serializar/enviar a client components
- **Task 4:** teste do hash não fixa o algoritmo (SHA-256 do token); faltam testes: revokeUserSessions sem except, sessões de outro usuário preservadas, fronteira exata de expiração, JWT válido com `t` ausente
- **Task 4:** getEnv() reparseia o ambiente a cada chamada (memoizar a chave)
- **Task 4:** saída dos testes com avisos do Vite sobre configLoader 'native' (pré-existente)
- **Task 5:** emailSchema sem max (e-mail de vários KB iria para coluna indexada de login_attempts; pode virar erro 500) — adicionar .max(254)
- **Task 5:** record + lastLoginAt + createSession fora de transação (linha de sucesso sem sessão se createSession lançar)
- **Task 5:** sem teste do limite por IP no nível do login (meta.ip)
- **Task 5:** comentários citam "constraints da tarefa"; título de teste "zera mustChangePassword" impreciso
- **Task 5:** exceção entre reserve e complete deixa a linha reservada contando como falha (5 erros de infra travam um e-mail por 15 min)
- **Task 5:** cada request bloqueado faz INSERT+DELETE (churn em login_attempts sob flood)
- **Task 5:** comentário de reserveLoginAttempt não diz que depende de autocommit (não chamar login dentro de db.transaction)
- **Task 5:** sob rajada podem ser admitidas menos de 5 tentativas (falha fechada; não documentado)
- **Task 5:** clientIp confia no 1º valor de x-forwarded-for (rotação de IP burla o limite por IP fora da Vercel) e junta ausentes em "unknown" — avaliar na T8/final
- **Task 5:** sem retenção/limpeza de login_attempts (previsto para o 0C)
- **Task 6:** regra do último dono é check-then-act sem lock (dois donos se rebaixando ao mesmo tempo deixam zero donos; TenantScope não tem transação) — levar à revisão final
- **Task 6:** ensureProfessionalLink é select-then-insert (23505 cru sob concorrência)
- **Task 6:** guarda do último dono ignora target.isActive (recusa rebaixar dono já inativo quando não há outro ativo)
- **Task 6:** desativar atualiza isActive e depois revoga; se a revogação falhar, sessões antigas voltam a valer ao reativar
- **Task 6:** ramo "outro erro é relançado" sem teste; mutação 4 do relatório imprecisa
- **Task 7:** staff-create remove todo "--" do argv, não só o separador inicial
- **Task 8:** proxy.ts duplica o literal "egc_session" sem teste de sincronia com SESSION_COOKIE
- **Task 8:** refreshSessionCookie renova no banco antes de checar se o cookie existe
- **Task 8:** action que lança (banco fora) rejeita na transition sem mensagem ao usuário
- **Task 8:** React.cache pode não memoizar dentro de Server Actions (sessão validada 2-3 vezes por action; só custo)
- **Task 8:** assertLocalForE2e engole TypeError de URL malformada (diagnóstico impreciso; falha fechada)
- **Task 8:** erros de banco não capturados no caminho do login (signIn) chegam ao logger do Next como DrizzleQueryError com params (e-mail completo e IP) — mesma classe do F1; levar à revisão final
- **Task 8:** requireStaff/refreshSessionCookie fora do try em trocar-senha/actions.ts (params = hash do token, id da sessão)
- **Task 8:** com reuseExistingServer, um `pnpm dev` já rodando com outro DATABASE_URL escapa da guarda do e2e
- **Task 8:** literal "egc_session" duplicado em proxy.ts e e2e/constants.ts sem teste de sincronia
- **Task 9:** cada execução do e2e deixa uma "Pessoa E2E" desativada no banco de dev (some no próximo seed)
- **Task 9:** helper login do e2e não espera hidratação (possível flake em next dev frio)
- **Task 9:** isPending único desabilita todos os cards durante uma mutação
- **Task 9:** src/server/errors.ts sem import "server-only"
- **Task 9:** nada fixa "permissão antes da validação dos argumentos" (falta caso: requirePermission rejeitando + id inválido deve rejeitar)
- **Task 9:** caminho feliz das actions não confere que id/role/isActive/input chegam ao serviço nem que temporaryPassword volta; "Gerar nova senha" sem e2e
- **Task 9:** Intl.DateTimeFormat lança RangeError com fuso inválido e tenants.timezone é text livre (validar como IANA quando houver tela de configuração)
- **Task 9:** revalidatePath ainda depois do mutate dentro do try
- **Task 9:** export type entre blocos de import em staff-list.tsx
- **Task 10:** README diz que "os scripts" falham sem SESSION_SECRET (provavelmente falso: seed/staff:create não importam client.ts)
- **Task 10:** tabela do README põe "profissionais" na coluna Nome
- **Final:** README — falta linha em branco antes do checklist de rollout (passos aparecem numerados 3-7)
- **Final:** README — parágrafo do seed em produção não diz que a senha dos usuários de exemplo vem do SEED_STAFF_PASSWORD do .env.local do operador
- **Final:** staff:create só mostra o host depois de achar a clínica (erro "Clínica não encontrada" não mostra o host)
- **Final:** README usa openssl num roteiro PowerShell (openssl vem com o Git Bash); URL entre aspas duplas interpola $ no PowerShell
- **Final:** next dev loga argumentos das Server Actions (e-mail e senha no terminal local); logging.serverFunctions=false fecha — só desenvolvimento
- **Final:** scripts staff:create/seed imprimem error.message (params de query no terminal do operador se rodar antes da migration); seed --force não mostra o host alvo
