# Fase 0B: Login da equipe, sessão e permissões (design)

- **Data:** 02/10/2026
- **Status:** aguardando revisão
- **Referências:** `CLAUDE.md`, `ROADMAP.md` (Fase 0), spec do 0A (`2026-09-30-fase-0a-base-design.md`)

## 1. Contexto e objetivo

O 0A entregou a base multi-tenant e a página pública. O 0B dá à equipe da clínica um acesso autenticado.

O 0B está pronto quando:
- o dono da clínica de exemplo entra em `/admin/login` e vê o painel da clínica dele;
- o dono cadastra a equipe em `/admin/equipe`;
- cada papel só acessa o que a matriz de permissões permite;
- nada de outra clínica fica acessível.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **E-mail único no sistema.** O login é global em `/admin/login`, e a clínica vem do usuário | Simples e compatível com `app/(admin)/admin` do CLAUDE.md. Quem trabalha em duas clínicas usa dois e-mails |
| D2 | **Primeiro dono criado por comando** (`pnpm staff:create`). O resto da equipe é cadastrado **pelo dono em `/admin/equipe`** | Não há cadastro público; produção precisa de um jeito de criar o primeiro usuário |
| D3 | **Senha provisória gerada pelo sistema, mostrada uma única vez, com troca obrigatória no primeiro login** | Não há envio de e-mail ainda; o dono nunca conhece a senha definitiva |
| D4 | **Papéis em enum** (`staff_role`: owner, reception, professional), e não na tabela `staff_roles` citada no CLAUDE.md | A lista de papéis e as permissões são fixas no código; uma tabela só se justificaria com papéis por clínica |
| D5 | **Sessão validada no banco a cada request** (cookie JWT assinado + tabela `sessions` com o hash do token) | Sair, desativar usuário ou trocar senha tem efeito imediato |
| D6 | **Limite de tentativas em tabela do Postgres** (`login_attempts`) | O CLAUDE.md pede contagem em tabela até existir Redis |
| D7 | **Recepção sem acesso a prontuário** (`clinical.manage`) | Dado de saúde; acesso mínimo (LGPD) |

## 3. Escopo

**Dentro:**
- login e logout da equipe;
- sessão e troca de senha;
- matriz de permissões;
- tela de equipe;
- comando `staff:create`;
- limite de tentativas;
- `/minha-conta` como página reservada;
- primeiro teste Playwright.

**Fora:**
- login do cliente por OTP (Etapa 1);
- link mágico e "esqueci minha senha" por e-mail;
- `audit_log` (0C);
- telas de agenda, catálogo, clientes e financeiro (MVP).

## 4. Rotas

| Rota | Acesso | Função |
|---|---|---|
| `/admin/login` | público | E-mail e senha. Quem já está logado é redirecionado para `/admin` |
| `/admin/trocar-senha` | logado | Obrigatória enquanto `must_change_password`; também serve para troca voluntária |
| `/admin` | logado | Painel mínimo: nome da clínica, nome e papel do usuário, link para a equipe (se dono), botão de sair |
| `/admin/equipe` | `staff.manage` | Lista e ações sobre a equipe |
| `/minha-conta` | público | Texto "Em breve: acompanhe seus agendamentos" |

**`src/proxy.ts`:** para `/admin/*`, exceto `/admin/login`, redireciona a `/admin/login` quando não há cookie `egc_session`. É só um atalho: a validação real acontece no servidor (seção 7).

## 5. Schema (uma migration nova)

Valem as convenções do 0A: `tenantColumns()`, FKs compostas e `unique(tenant_id, id)`.

| Tabela | Colunas | Restrições |
|---|---|---|
| `staff_users` | tenant_id, name, email, password_hash, role (`staff_role`), must_change_password (padrão false), is_active (padrão true), last_login_at | `unique(email)`; `check (email = lower(email))` |
| `sessions` | tenant_id, staff_user_id, token_hash, expires_at, revoked_at, ip, user_agent | FK `(tenant_id, staff_user_id) → staff_users(tenant_id, id)` com cascade; `unique(token_hash)`; índice em `staff_user_id` |
| `login_attempts` | id, created_at, tenant_id (nulo permitido, FK com cascade), email, ip, succeeded | Índices `(email, created_at)` e `(ip, created_at)` |
| `professionals` (alteração) | + staff_user_id (nulo permitido) | FK composta `(tenant_id, staff_user_id) → staff_users(tenant_id, id)` sem ação no delete (usuários não são apagados, só desativados); `unique(staff_user_id)` |

- **Exceção de tenant:** `login_attempts` é a única tabela de negócio com `tenant_id` opcional, porque uma tentativa com e-mail inexistente não pertence a nenhuma clínica. O teste de guarda do schema passa a ter uma lista explícita de exceções: `tenants` e `login_attempts`.
- **Dado pessoal:** `login_attempts` guarda e-mail e IP. O 0C define o prazo de retenção e a limpeza por cron.

## 6. Autenticação

### Senhas (`src/server/auth/password.ts`)
- **Hash:** Argon2id via `@node-rs/argon2`, com memória de 19 MiB, 2 iterações e paralelismo 1 (OWASP).
- **Regra:** 10 a 128 caracteres, sem exigência de classes de caractere.
- **Provisória:** 14 caracteres do alfabeto `ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789`, gerados com `crypto.randomInt`.

### Sessão (`src/server/auth/session.ts`)
- **Token:** 32 bytes aleatórios em base64url. O banco guarda só o SHA-256 em hex.
- **Cookie:** `egc_session`, com `httpOnly`, `secure` quando `NODE_ENV === "production"`, `sameSite: "lax"` e `path: "/"`. O valor é um JWT HS256 (`jose`) com `{ t: token }`, assinado com `SESSION_SECRET`.
- **Duração:** 7 dias. Quando faltar menos de 1 dia, é renovada por mais 7 (em Server Actions e Route Handlers, onde é possível gravar cookie).
- **Validação:** confere a assinatura, busca a sessão pelo hash e exige que ela não esteja revogada nem expirada e que o usuário esteja ativo.
- **Revogação de todas as sessões do usuário:**
  - ao desativar o usuário;
  - ao gerar nova senha provisória;
  - ao trocar a senha (nesse caso, a sessão atual continua).
- **Logout:** grava `revoked_at` e apaga o cookie.

### Login (Server Action)
1. Valida o formato com Zod; o e-mail é normalizado com `trim` e minúsculas.
2. Checa o limite de tentativas. Se estourado, devolve "Muitas tentativas. Tente novamente em alguns minutos."
3. Busca o usuário pelo e-mail. Se não existir, verifica a senha contra um hash falso fixo, para igualar o tempo de resposta.
4. E-mail inexistente, senha errada e usuário desativado devolvem a mesma mensagem: "E-mail ou senha incorretos."
5. Registra a tentativa (sucesso ou falha).
6. Em caso de sucesso: grava `last_login_at`, cria a sessão e redireciona para `/admin/trocar-senha` se `must_change_password`, ou para `/admin` caso contrário.

### Limite de tentativas (`src/server/auth/rate-limit.ts`)
- **Janela:** 15 minutos.
- **Por e-mail:** bloqueia com 5 falhas desde o último sucesso.
- **Por IP:** bloqueia com 20 falhas.
- **IP:** o primeiro valor de `x-forwarded-for`; `"unknown"` se ausente.

### Variáveis de ambiente
- `SESSION_SECRET` passa a ser obrigatória, com no mínimo 32 caracteres.
- `SEED_STAFF_PASSWORD` é opcional e só o seed usa.

### Acesso direto ao client
A lista do teste de guarda de import passa a ser: `services/tenants.ts`, `auth/session.ts` e `auth/rate-limit.ts`. Os dois últimos rodam antes de se conhecer o tenant.

## 7. Autorização

`src/server/auth/permissions.ts`: tipo `Permission`, mapa `ROLE_PERMISSIONS` e função `can(role, permission)`.

| Permissão | owner | reception | professional |
|---|---|---|---|
| `staff.manage` | ✅ | | |
| `settings.manage` | ✅ | | |
| `catalog.manage` | ✅ | | |
| `finance.view` | ✅ | | |
| `agenda.manage` | ✅ | ✅ | |
| `agenda.view_own` | ✅ | ✅ | ✅ |
| `clients.manage` | ✅ | ✅ | |
| `clinical.manage` | ✅ | | ✅ |

`src/server/auth/current.ts`:
- **`getStaff()`** devolve `{ user, tenant, scope } | null` e é memoizado por request com `React.cache`.
- **`requireStaff()`** devolve o mesmo ou redireciona para `/admin/login`. Se `must_change_password`, redireciona para `/admin/trocar-senha`, exceto quando chamado com `{ allowPasswordChange: true }`.
- **`requirePermission(p)`** chama `requireStaff()` e depois `notFound()` se o papel não tiver a permissão.
- **Toda Server Action** chama `requireStaff` ou `requirePermission` no início.

## 8. Equipe

`src/server/services/staff.ts` recebe um `TenantScope` e o usuário atual.

| Operação | Regras |
|---|---|
| Listar | Todos os usuários do tenant, ordenados por nome |
| Cadastrar (nome, e-mail, papel) | E-mail já usado em qualquer clínica devolve "Este e-mail já está em uso."; gera a provisória; `must_change_password = true`; se o papel é `professional`, cria também o `professionals` vinculado |
| Mudar papel | Não se aplica a si mesmo; não pode rebaixar o último dono ativo; mudar para `professional` cria o `professionals` vinculado se não existir |
| Desativar / reativar | Não se aplica a si mesmo; não pode desativar o último dono ativo; desativar revoga as sessões |
| Nova senha provisória | Não se aplica a si mesmo (usa `/admin/trocar-senha`); revoga as sessões; `must_change_password = true` |
| Trocar a própria senha | Exige a senha atual; a nova precisa ser diferente; limpa `must_change_password` |

A verificação de e-mail duplicado depende da restrição `unique(email)` do banco: o erro de violação é traduzido para a mensagem acima. Não há consulta prévia fora do escopo do tenant.

**Tela `/admin/equipe`:**
- lista em cards no celular, com nome, e-mail, papel, situação (ativo, desativado, senha provisória) e último acesso em `dd/MM/yyyy`;
- formulário de cadastro com react-hook-form e Zod;
- a provisória aparece uma vez num diálogo, com botão de copiar.

**Comando `pnpm staff:create`** (`src/server/db/staff-create.ts`):
- argumentos `--tenant <slug> --name <nome> --email <e-mail> --role <owner|reception|professional>`;
- usa `pg` com `DATABASE_URL_UNPOOLED`;
- imprime a senha provisória uma vez;
- funciona em qualquer banco, porque só insere.

## 9. Seed

Além do que já cria, o seed insere:
- dono (`dono@easyglowcare.test`);
- recepção (`recepcao@easyglowcare.test`);
- um usuário `professional` para cada um dos 3 profissionais, vinculado ao profissional.

Todos usam a senha de `SEED_STAFF_PASSWORD` (ou uma gerada e impressa) e têm `must_change_password = false`.

## 10. Pacotes

- **Dependências:** `jose`, `@node-rs/argon2`, `react-hook-form`, `@hookform/resolvers`, `date-fns`.
- **Dependência de desenvolvimento:** `@playwright/test`.
- **shadcn:** `input`, `label`, `select`, `badge`, `dialog`, `sonner`.

## 11. Testes

Vitest contra o Postgres de teste, com os testes escritos antes do código.

| Área | Casos |
|---|---|
| Senha | Hash e verificação; senha errada falha; a provisória tem 14 caracteres do alfabeto definido |
| Sessão | Criar e validar; recusa expirada, revogada, de usuário desativado e cookie adulterado; renova quando falta menos de 1 dia; o banco guarda só o hash |
| Limite | 5 falhas por e-mail bloqueiam; 20 por IP bloqueiam; sucesso zera o e-mail; falhas fora da janela não contam |
| Login | Mesma mensagem nos três casos de falha; destino correto com e sem senha provisória; registra a tentativa |
| Permissões | A matriz inteira; `requirePermission` nega sem permissão |
| Equipe | Cada regra da seção 8, incluindo id de outro tenant e e-mail duplicado em outro tenant |
| Guardas | Exceção `login_attempts`; lista de imports ampliada |

Playwright (`e2e/admin-login.spec.ts`, viewport 375×812, com `pnpm test:e2e` contra `pnpm dev` e o banco de dev com seed):
1. Sem login, `/admin` redireciona para `/admin/login`.
2. O dono faz login, vê o painel, abre a equipe e cadastra uma pessoa; a provisória aparece.
3. O dono sai; a pessoa nova entra com a provisória, é obrigada a trocar a senha e chega ao painel.
4. A recepção recebe 404 em `/admin/equipe`.

## 12. Documentação

- **`.env.example`:** `SESSION_SECRET` obrigatória (com o comando para gerar) e `SEED_STAFF_PASSWORD`.
- **CLAUDE.md:** na seção 5, trocar `staff_roles` por "papel em enum `staff_role`"; na seção 9, acrescentar `pnpm staff:create`.
- **ROADMAP.md:** marcar "Rotas…", "Login da equipe…" e "Permissões…".
- **README.md:** `SESSION_SECRET` na Vercel, e como criar o primeiro dono em produção.

## 13. Critério de pronto

- `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm test:e2e` limpos; `pnpm build` passando.
- Migration aplicada no Docker; seed rodando duas vezes seguidas.
- Fluxo conferido no navegador em 375px.
- Documentos da seção 12 atualizados.

**Depois do merge, fica com o usuário:**
1. Cadastrar `SESSION_SECRET` na Vercel (Production e Preview, com valores diferentes).
2. Rodar `pnpm db:migrate` em produção e em staging.
3. Rodar `pnpm staff:create` para criar o dono em produção.
