# MVP, Etapa 1: entrada sem senha (plano de implementação)

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** a pessoa entra na clínica só com CPF, nome, celular e um código de 6 dígitos, vira lead com consentimentos e origem gravados, e volta depois só com CPF e código.

**Arquitetura:**
- **Funções puras** em `src/lib/` (CPF, celular, origem, caminho de retorno, textos legais), testadas com Vitest sem banco.
- **Núcleo de servidor** em `src/server/auth/` e `src/server/services/`, recebendo `db` e `now`, testado contra o Postgres do Docker. O envio do código entra por injeção (`EntryDeps`), sem tocar em `getEnv` nem no provedor dentro dos testes.
- **Ligação com o Next** em `src/server/auth/current-client.ts` (cookies, cabeçalhos, `db`) e em arquivos finos de páginas e actions dentro de `src/app/(public)/[slug]/`.
- **Navegador:** Playwright em 375 px com telefone de teste (`OTP_TEST_PHONES`), em dev e no CI em modo produção.

**Stack:** Next.js 16 (App Router, Server Actions, proxy), Drizzle + drizzle-kit, `jose`, react-hook-form + Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-mvp-etapa-1-entrada-design.md`. Leia antes de começar; este plano não repete os motivos das decisões.

## Restrições globais

- Valem as restrições globais dos planos do 0A, 0B, 0C e 0D (`docs/superpowers/plans/`): convenções de schema (FK composta `(tenant_id, x_id)`, `unique(tenant_id, id)`, `timestamptz`, `casing: "snake_case"`), `tenantScope`, Next 16, pt-BR, TDD, commits em português no imperativo terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Branch:** `feat/mvp-etapa-1-entrada` (já criado a partir de `staging`). Não fazer push nem abrir PR: o dono faz isso à mão.
- **Next 16:** antes de escrever código do Next, leia em `node_modules/next/dist/docs/01-app/`: `02-guides/authentication.md`, `03-api-reference/04-functions/cookies.md`, `03-api-reference/04-functions/redirect.md`, `03-api-reference/03-file-conventions/proxy.md` (regra do `AGENTS.md`).
- **Imports do client do banco:** só `src/server/auth/current.ts`, `src/server/auth/current-client.ts` (novo), `src/server/jobs/run.ts` e `src/server/services/tenants.ts` importam `@/server/db/client`.
- **Consultas entre clínicas com `db` direto** (sem `tenantScope`) só em: limites de envio de `otp_codes` (`otp.ts`) e validação de sessão por hash de token (`client-session.ts`). Cada uma com comentário explicando a exceção, como em `rate-limit.ts`.
- **Nunca logar nem devolver em erro:** CPF, telefone completo, nome, código, token, IP. Erro inesperado é logado com `describeUnexpectedError` (`src/server/errors.ts`).
- **Sem dependências novas.**
- **Valores fixos** (copiar exatamente):
  - código: 6 dígitos, validade **5 min**, máximo **5** tentativas, HMAC-SHA256 de `<challengeId>:<código>` com `SESSION_SECRET`;
  - limites: por telefone **3 em 15 min** e **10 em 24 h**; por IP **10 em 15 min**; reenvio só **60 s** depois da criação do desafio atual;
  - cookie `egc_otp`: **10 min**; cookie `egc_cliente`: **30 dias**, renovação quando faltar **menos de 7 dias**; `egc_origem`: **30 dias**, cada valor cortado em **100** caracteres; todos com `path=/<slug>`, `httpOnly`, `sameSite=lax`, `secure` em produção;
  - limpeza: `otp_codes` com mais de **24 h**; `person_sessions` vencidas ou revogadas há mais de **30 dias**;
  - `TERMS_VERSION = "v1"`; código fixo dos telefones de teste: `000000`.
- **Mensagens fixas** (texto exato, seção 6.8 da spec):
  - "CPF inválido. Confira os números."
  - "Informe um celular com DDD, como (11) 98765-4321."
  - "Para continuar, aceite os Termos de Uso e a Política de Privacidade."
  - "Código incorreto. Restam N tentativas." (com N = 1: "Código incorreto. Resta 1 tentativa.")
  - "Este código expirou. Peça um novo."
  - "Você errou o código 5 vezes. Peça um novo."
  - "Muitas tentativas. Tente de novo em alguns minutos."
  - "Não conseguimos enviar o código agora. Tente de novo em instantes."
  - "Este CPF já tem cadastro. Entre de novo com seu CPF."
  - Novas (não estão na spec): "Informe seu nome." (menos de 2 caracteres), "Use no máximo 100 caracteres." (nome), "Digite os 6 números do código.", "Aguarde para pedir um novo código." (reenvio antes de 60 s), "Não foi possível continuar. Tente novamente." (erro inesperado na action).
- **Banco:** migrations e comandos destrutivos só contra o Docker local. Antes de `pnpm db:migrate`, confirme que `DATABASE_URL_UNPOOLED` não está definida no shell.
- **Servidor local:** para parar, mate só o PID que escuta a porta 3000. Nunca `taskkill /IM node.exe`.
- **TDD com teste de mutação** em cada proteção (limites, consumo atômico, filtro de clínica, `timingSafeEqual`, recusa em produção): desligue a proteção, veja o teste falhar, religue.

## Foco de revisão

1. **CPF, celular e código colados com pontuação ou espaços** (`" 529.982.247-25 "`, `"(11) 98765-4321"`, `"123 456"`): são normalizados para só dígitos e aceitos; com dígitos a mais ou a menos são recusados com a mensagem fixa. Testes na Tarefa 1.
2. **`?voltar=` malicioso** (`//evil.com`, `https://evil.com`, `/\evil.com`, `/outra-clinica/minha-conta`, `/easyglowcare/../admin`): cai em `/<slug>/minha-conta`. Teste na Tarefa 1.
3. **Cookie de outra clínica** (`egc_otp` ou `egc_cliente` emitido em `/clinica-a` e apresentado em `/clinica-b`): é ignorado; o código não é verificado e a sessão não vale. Testes nas Tarefas 5 e 8.
4. **Duplo envio** (dois cliques em "Enviar código" ou "Entrar" quase juntos): os limites e o consumo atômico seguram; nunca duas pessoas nem duas sessões para o mesmo desafio. Testes nas Tarefas 7 e 8.
5. **Clínica sem telefone no local ativo:** a tela do código não mostra o link "Fale com a clínica" e não quebra. Teste na Tarefa 10.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/br/cpf.ts`, `src/lib/br/phone.ts` | Validação, normalização, formatação e máscara |
| `src/lib/validation/entry.ts` | Schemas Zod do fluxo de entrada e de `pending_signup` |
| `src/lib/return-path.ts` | `safeReturnPath` |
| `src/lib/lead-origin.ts` | Cookie de origem e cálculo de `source` |
| `src/lib/legal/terms.ts` | Versão e textos de termos e privacidade |
| `src/lib/env.ts` | `OTP_TEST_PHONES`, `VERCEL_ENV` |
| `src/proxy.ts` | Grava `egc_origem` |
| `src/server/db/schema/people.ts` | `people`, `person_consents` e enums |
| `src/server/db/schema/auth.ts` | `otp_codes`, `person_sessions` |
| `drizzle/0004_people_entry.sql` | Migration gerada |
| `src/server/auth/token.ts` | Token, hash e cookie assinado (extraído de `session.ts`) |
| `src/server/auth/client-session.ts` | Sessão do cliente |
| `src/server/auth/otp.ts` | Código, HMAC e reserva com limites |
| `src/server/auth/entry.ts` | Orquestra CPF → cadastro → código → sessão |
| `src/server/services/people.ts` | Pessoa, consentimentos e conversão |
| `src/server/jobs/cleanup.ts` | Limpeza dos dados novos |
| `src/server/auth/current-client.ts` | Ligação com o Next (cookies, cabeçalhos, `db`, provedor) |
| `src/app/(public)/[slug]/entrar/*` | Página, formulário em etapas, actions |
| `src/app/(public)/[slug]/minha-conta/*` | Página, renovação de sessão, sair |
| `src/app/(public)/[slug]/termos/page.tsx`, `privacidade/page.tsx` | Textos legais |
| `src/app/(public)/[slug]/page.tsx` | Link "Entrar" / "Minha conta" |
| `src/app/(cliente)/` | Removida |
| `e2e/entry.spec.ts`, `e2e/global-setup.ts`, `e2e/constants.ts`, `.github/workflows/ci.yml` | Testes de navegador e CI |
| `CLAUDE.md`, `README.md`, `ROADMAP.md`, `.env.example`, `docs/superpowers/notes/` | Documentação |

---

### Task 1: CPF, celular, schemas e caminho de retorno

**Arquivos:**
- Criar: `src/lib/br/cpf.ts`, `src/lib/br/phone.ts`, `src/lib/validation/entry.ts`, `src/lib/return-path.ts`, `src/lib/legal/terms.ts` (só com `export const TERMS_VERSION = "v1";`; a Task 11 completa)
- Testar: `src/lib/br/cpf.test.ts`, `src/lib/br/phone.test.ts`, `src/lib/validation/entry.test.ts`, `src/lib/return-path.test.ts`

**Interfaces:**
- Produz:
  - `onlyDigits(value: string): string` em `cpf.ts` (`phone.ts` importa de lá)
  - `isValidCpf(digits: string): boolean`, `normalizeCpf(value: string): string`, `formatCpf(value: string): string` (progressivo: aceita parcial), `maskCpf(digits: string): string`
  - `isValidMobile(digits: string): boolean`, `normalizePhone(value: string): string`, `formatPhone(value: string): string` (progressivo), `maskPhone(digits: string): string`
  - `cpfSchema`, `phoneSchema`, `nameSchema`, `codeSchema`, `otpChannelSchema` (`"whatsapp" | "sms"`), `startEntrySchema` (`{ cpf }`), `signupSchema` (`{ cpf, name, phone, acceptTerms: true, marketing: boolean }`), `verifyCodeSchema` (`{ code }`), `resendSchema` (`{ channel }`)
  - tipos `OtpChannel`, `SignupInput`, `PendingSignup = { name: string; cpf: string; phone: string; marketing: boolean; termsVersion: string; origin: LeadOriginParams }` e `pendingSignupSchema`. `LeadOriginParams` vem da Task 2; nesta tarefa declare `pendingSignupSchema.origin` como `leadOriginParamsSchema` importado de `@/lib/lead-origin` e crie esse arquivo com só o schema e o tipo (a Task 2 completa o resto).
  - `safeReturnPath(slug: string, voltar: string | null | undefined): string`

- [ ] **Passo 1: testes que falham**

`cpf.test.ts`:
```ts
expect(isValidCpf("52998224725")).toBe(true);
expect(isValidCpf("11144477735")).toBe(true);
expect(isValidCpf("52998224724")).toBe(false);
expect(isValidCpf("11111111111")).toBe(false); // todas as sequências repetidas 0..9
expect(isValidCpf("5299822472")).toBe(false);
expect(normalizeCpf(" 529.982.247-25 ")).toBe("52998224725");
expect(formatCpf("52998224725")).toBe("529.982.247-25");
expect(formatCpf("5299")).toBe("529.9");
expect(formatCpf("5299822")).toBe("529.982.2");
expect(formatCpf("529982247251234")).toBe("529.982.247-25"); // corta em 11
expect(maskCpf("52998224725")).toBe("***.982.247-**");
```

`phone.test.ts`:
```ts
expect(isValidMobile("11987654321")).toBe(true);
expect(isValidMobile("1187654321")).toBe(false);  // 10 dígitos (fixo)
expect(isValidMobile("11887654321")).toBe(false); // sem o 9
expect(isValidMobile("01987654321")).toBe(false); // DDD com 0
expect(normalizePhone("(11) 98765-4321")).toBe("11987654321");
expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321"); // tira o 55 quando sobram 13 dígitos
expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
expect(formatPhone("119")).toBe("(11) 9");
expect(maskPhone("11987651234")).toBe("(11) *****-1234");
```

`entry.test.ts`:
```ts
expect(startEntrySchema.parse({ cpf: "529.982.247-25" })).toEqual({ cpf: "52998224725" });
expect(startEntrySchema.safeParse({ cpf: "529.982.247-24" }).error?.issues[0].message).toBe("CPF inválido. Confira os números.");
// signup: nome com trim; 1 caractere → "Informe seu nome."; 101 → "Use no máximo 100 caracteres."
// celular fixo → "Informe um celular com DDD, como (11) 98765-4321."
// acceptTerms false → "Para continuar, aceite os Termos de Uso e a Política de Privacidade."
// marketing ausente → false
expect(verifyCodeSchema.parse({ code: "123 456" })).toEqual({ code: "123456" });
expect(verifyCodeSchema.safeParse({ code: "12345" }).error?.issues[0].message).toBe("Digite os 6 números do código.");
expect(resendSchema.safeParse({ channel: "email" }).success).toBe(false);
```

`return-path.test.ts`:
```ts
expect(safeReturnPath("easyglowcare", "/easyglowcare/minha-conta")).toBe("/easyglowcare/minha-conta");
expect(safeReturnPath("easyglowcare", "/easyglowcare")).toBe("/easyglowcare");
for (const bad of [null, undefined, "", "//evil.com", "https://evil.com", "/\\evil.com",
  "/outra/minha-conta", "/easyglowcare/../admin", "/easyglowcarex", "/easyglowcare/entrar"]) {
  expect(safeReturnPath("easyglowcare", bad)).toBe("/easyglowcare/minha-conta");
}
```
(`/entrar` como destino é recusado para não criar laço.)

- [ ] **Passo 2:** `pnpm test src/lib/br src/lib/validation/entry.test.ts src/lib/return-path.test.ts` → FAIL (módulos inexistentes).
- [ ] **Passo 3:** implemente. `safeReturnPath` recusa qualquer valor que contenha `\`, `..`, `//` ou que não seja exatamente `/<slug>` ou comece com `/<slug>/`. Os schemas usam `z.preprocess`/`transform` para normalizar antes de validar.
- [ ] **Passo 4:** mesmo comando → PASS; `pnpm typecheck` limpo.
- [ ] **Passo 5:** commit "Adiciona validação de CPF, celular e schemas da entrada".

---

### Task 2: origem do lead e cookie no proxy

**Arquivos:**
- Modificar: `src/lib/lead-origin.ts` (criado na Task 1), `src/proxy.ts`
- Testar: `src/lib/lead-origin.test.ts`

**Interfaces:**
- Produz:
  - `ORIGIN_COOKIE = "egc_origem"`, `ORIGIN_PARAMS = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","ref"] as const`
  - `type LeadOriginParams = Partial<Record<(typeof ORIGIN_PARAMS)[number], string>>`, `leadOriginParamsSchema`
  - `type LeadSource = "instagram" | "google" | "referral" | "direct" | "other"`
  - `originCookieFor(pathname: string, searchParams: URLSearchParams, hasCookie: boolean): { path: string; value: string } | null`
  - `parseOriginCookie(value: string | undefined): LeadOriginParams` (inválido → `{}`)
  - `resolveLeadSource(params: LeadOriginParams): LeadSource`

- [ ] **Passo 1: testes que falham**
```ts
// resolveLeadSource — tabela da seção 4.3 da spec, na ordem
expect(resolveLeadSource({ ref: "ana", utm_source: "instagram" })).toBe("referral");
expect(resolveLeadSource({ utm_source: "Instagram" })).toBe("instagram");
expect(resolveLeadSource({ utm_source: "IG" })).toBe("instagram");
expect(resolveLeadSource({ utm_source: "google-ads" })).toBe("google");
expect(resolveLeadSource({})).toBe("direct");
expect(resolveLeadSource({ utm_campaign: "x" })).toBe("other");

// originCookieFor
const sp = new URLSearchParams("utm_source=instagram&foo=1");
expect(originCookieFor("/easyglowcare", sp, false)).toEqual({ path: "/easyglowcare", value: JSON.stringify({ utm_source: "instagram" }) });
expect(originCookieFor("/easyglowcare/termos", sp, false)?.path).toBe("/easyglowcare");
expect(originCookieFor("/easyglowcare", sp, true)).toBeNull();               // primeiro toque vence
expect(originCookieFor("/easyglowcare", new URLSearchParams("foo=1"), false)).toBeNull();
expect(originCookieFor("/admin", sp, false)).toBeNull();
expect(originCookieFor("/", sp, false)).toBeNull();
expect(originCookieFor("/Easy Glow", sp, false)).toBeNull();                // slug inválido
expect(JSON.parse(originCookieFor("/a", new URLSearchParams(`ref=${"x".repeat(300)}`), false)!.value).ref).toHaveLength(100);

// parseOriginCookie
expect(parseOriginCookie(undefined)).toEqual({});
expect(parseOriginCookie("nao-json")).toEqual({});
expect(parseOriginCookie(JSON.stringify({ utm_source: 5 }))).toEqual({});
expect(parseOriginCookie(JSON.stringify({ ref: "ana", outro: "x" }))).toEqual({ ref: "ana" });
```
- [ ] **Passo 2:** `pnpm test src/lib/lead-origin.test.ts` → FAIL.
- [ ] **Passo 3:** implemente. O slug é o primeiro segmento, validado com o mesmo padrão de `normalizeSlug` (`^[a-z0-9]+(-[a-z0-9]+)*$`, até 63) e diferente de `admin`; não importe `services/tenants.ts` (módulo de servidor). No `proxy.ts`, depois de montar a resposta, chame `originCookieFor(pathname, request.nextUrl.searchParams, request.cookies.has(ORIGIN_COOKIE))` e, se vier valor, `response.cookies.set(ORIGIN_COOKIE, value, { path, maxAge: 30 dias, httpOnly: true, sameSite: "lax", secure: protocol === "https:" })`.
- [ ] **Passo 4:** PASS; `pnpm test`, `pnpm lint` e `pnpm typecheck` limpos; `pnpm test:e2e e2e/security.spec.ts` continua verde (o proxy mudou).
- [ ] **Passo 5:** commit "Grava a origem do lead na primeira visita".

---

### Task 3: variáveis de ambiente dos telefones de teste

**Arquivos:**
- Modificar: `src/lib/env.ts`, `.env.example`
- Testar: `src/lib/env.test.ts`

**Interfaces:**
- Produz: `Env.OTP_TEST_PHONES: string[]` (vazio por padrão) e `Env.VERCEL_ENV?: "production" | "preview" | "development"`.

- [ ] **Passo 1: testes que falham** (em `env.test.ts`, com o `base` existente)
```ts
expect(getEnv(base).OTP_TEST_PHONES).toEqual([]);
expect(getEnv({ ...base, OTP_TEST_PHONES: "" }).OTP_TEST_PHONES).toEqual([]);
expect(getEnv({ ...base, OTP_TEST_PHONES: "11900000001, 11900000002" }).OTP_TEST_PHONES).toEqual(["11900000001", "11900000002"]);
expect(() => getEnv({ ...base, OTP_TEST_PHONES: "1190000" })).toThrow(/OTP_TEST_PHONES/);
expect(getEnv({ ...base, VERCEL_ENV: "preview", OTP_TEST_PHONES: "11900000001" }).OTP_TEST_PHONES).toHaveLength(1);
expect(() => getEnv({ ...base, VERCEL_ENV: "production", OTP_TEST_PHONES: "11900000001" })).toThrow(/OTP_TEST_PHONES.*produção/);
expect(getEnv({ ...base, VERCEL_ENV: "production" }).OTP_TEST_PHONES).toEqual([]);
```
- [ ] **Passo 2:** `pnpm test src/lib/env.test.ts` → FAIL.
- [ ] **Passo 3:** implemente com `superRefine` no objeto; mensagem do erro: `OTP_TEST_PHONES: proibida em produção`. Cada número validado com `isValidMobile`. No `.env.example`, depois de `MESSAGING_PROVIDER`: `OTP_TEST_PHONES=                 # só fora de produção: celulares com código fixo 000000 (ex.: 11900000001)`.
- [ ] **Passo 4:** PASS (com teste de mutação na recusa em produção).
- [ ] **Passo 5:** commit "Adiciona telefones de teste do código, proibidos em produção".

---

### Task 4: schema e migration

**Arquivos:**
- Criar: `src/server/db/schema/people.ts`, `drizzle/0004_people_entry.sql` (+ snapshot/journal gerados)
- Modificar: `src/server/db/schema/auth.ts`, `src/server/db/schema/index.ts`
- Testar: `src/server/db/schema/people.test.ts`

**Interfaces:**
- Produz (tabelas e tipos, exatamente como na seção 5 da spec):
  - enums `personStatus`, `conversionReason`, `leadSource`, `consentKind`, `otpPurpose`
  - `people`, `personConsents`, `otpCodes`, `personSessions`
  - tipos `Person`, `PersonConsent`, `OtpCode`, `PersonSession`
  - `otpCodes.pendingSignup` tipado com `.$type<PendingSignup>()`

- [ ] **Passo 1: testes que falham** (integração, `resetDb()` + tenant como em `session.test.ts`)
  - insere pessoa válida; segunda pessoa com o mesmo CPF na mesma clínica falha com violação única; mesmo CPF em outra clínica é aceito;
  - `cpf = "5299822472"` e `phone = "1187654321"` falham no `CHECK`;
  - `status = "client"` sem `converted_at` falha;
  - `otp_codes` com `purpose = "login"` e `person_id` nulo falha; com `purpose = "signup"` e `pending_signup` nulo falha; `channel = "email"` falha;
  - apagar a pessoa apaga consentimentos, desafios de login e sessões (cascade).
- [ ] **Passo 2:** `pnpm test src/server/db/schema/people.test.ts` → FAIL.
- [ ] **Passo 3:** escreva o schema e rode `pnpm db:generate --name people_entry`. Confira o SQL gerado: os `CHECK`, `UNIQUE (tenant_id, cpf)`, índices `(tenant_id, phone)`, `(person_id, kind, created_at)`, `(phone, created_at)`, `(ip, created_at)`, `person_sessions.token_hash` único e as FKs compostas com cascade. Rode `pnpm db:migrate` (Docker) e confirme que o banco de teste também recebe a migration pelo `test/global-setup.ts`.
- [ ] **Passo 4:** PASS; `pnpm test` inteiro verde.
- [ ] **Passo 5:** commit "Adiciona tabelas de pessoas, consentimentos, códigos e sessões de cliente".

---

### Task 5: token compartilhado e sessão do cliente

**Arquivos:**
- Criar: `src/server/auth/token.ts`, `src/server/auth/client-session.ts`
- Modificar: `src/server/auth/session.ts`
- Testar: `src/server/auth/token.test.ts`, `src/server/auth/client-session.test.ts` (os testes de `session.test.ts` não mudam)

**Interfaces:**
- Produz:
  - `generateToken(): string` (32 bytes, base64url), `hashToken(token: string): string` (sha256 hex)
  - `signPayload(payload: Record<string, string>, expiresAt?: Date): Promise<string>`; `verifyPayload(value: string | undefined): Promise<Record<string, unknown> | null>` (nunca lança por JWT inválido; erro de configuração do segredo propaga, como hoje)
  - `CLIENT_SESSION_COOKIE = "egc_cliente"`, `CLIENT_SESSION_TTL_MS` (30 dias), `CLIENT_SESSION_RENEW_BEFORE_MS` (7 dias)
  - `type ClientSession = { sessionId: string; person: Person; tenant: Tenant; expiresAt: Date; shouldRenew: boolean }`
  - `createClientSession(db, person: Pick<Person, "id" | "tenantId">, meta: SessionMeta, now?): Promise<{ cookieValue: string; expiresAt: Date }>`
  - `validateClientSession(db, tenantId: string, cookieValue: string | undefined, now?): Promise<ClientSession | null>`
  - `renewClientSession(db, sessionId, now?): Promise<Date>`, `revokeClientSession(db, sessionId): Promise<void>`

- [ ] **Passo 1: testes que falham** (`client-session.test.ts`, no estilo de `session.test.ts`)
  - cria e valida; guarda só o hash;
  - **sessão de outra clínica:** `validateClientSession(db, outroTenant.id, cookie)` → `null`;
  - vencida, revogada, cookie lixo, cookie assinado com outro segredo → `null`;
  - `shouldRenew` só quando faltar menos de 7 dias; `renewClientSession` empurra para +30 dias;
  - um cookie de **equipe** (`createSession`) não valida como cliente, e vice-versa (`validateSession` com cookie de cliente → `null`).
  - `token.test.ts`: `verifyPayload` com `expiresAt` passado → `null`; sem `expiresAt` não expira; payload volta igual.
- [ ] **Passo 2:** FAIL.
- [ ] **Passo 3:** extraia de `session.ts` para `token.ts` sem mudar o comportamento da equipe; implemente `client-session.ts` (consulta `person_sessions` → `people` → `tenants` com `db` direto, filtrando por `tenant_id` igual ao recebido).
- [ ] **Passo 4:** `pnpm test src/server/auth` → PASS, incluindo os testes antigos de `session.test.ts`, `login.test.ts` e `current.test.ts` sem alteração.
- [ ] **Passo 5:** commit "Extrai o token de sessão e adiciona a sessão do cliente".

---

### Task 6: serviço de pessoas

**Arquivos:**
- Criar: `src/server/services/people.ts`
- Testar: `src/server/services/people.test.ts`

**Interfaces:**
- Consome: `PendingSignup` (Task 1), `resolveLeadSource` (Task 2), tabelas (Task 4), `isUniqueViolation` (`src/server/errors.ts`).
- Produz:
  - `findPersonByCpf(scope: TenantScope, cpf: string): Promise<Person | null>`
  - `createLeadFromSignup(db: AnyPgDatabase, tenantId: string, signup: PendingSignup, meta: SessionMeta, now?: Date): Promise<{ ok: true; person: Person } | { ok: false; reason: "cpf-taken" }>` — numa transação (`db.transaction((tx) => … tenantScope(tx, tenantId) …)`): insere a pessoa com `phone_verified_at = now`, `source` e `utm_*`/`ref`, e duas linhas em `person_consents` (`terms` com `granted = true` e `version = signup.termsVersion`; `marketing` com `granted = signup.marketing`), ambas com IP e user-agent
  - `markPhoneVerified(scope: TenantScope, personId: string, now?: Date): Promise<void>`
  - `convertLeadToClient(scope: TenantScope, personId: string, reason: "appointment" | "payment" | "attendance", now?: Date): Promise<Person | null>`

- [ ] **Passo 1: testes que falham**
  - cria lead com os dois consentimentos, origem `instagram` a partir de `{ utm_source: "instagram" }`, IP e user-agent gravados;
  - CPF já existente → `{ ok: false, reason: "cpf-taken" }` e **nenhuma** linha nova em `people` nem em `person_consents` (a transação desfaz);
  - `findPersonByCpf` não encontra pessoa de outra clínica;
  - `convertLeadToClient`: lead vira `client` com `converted_at` e motivo; segunda chamada não altera `converted_at` nem o motivo; pessoa de outra clínica → `null`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente. **Passo 4:** PASS (mutação: remova a transação e veja o teste do CPF repetido falhar se o consentimento for inserido antes da pessoa — mantenha a ordem pessoa → consentimentos).
- [ ] **Passo 5:** commit "Adiciona o serviço de pessoas com consentimentos e conversão".

---

### Task 7: código e limites de envio

**Arquivos:**
- Criar: `src/server/auth/otp.ts`
- Testar: `src/server/auth/otp.test.ts`

**Interfaces:**
- Produz:
  - constantes `OTP_TTL_MS`, `OTP_MAX_ATTEMPTS = 5`, `RESEND_COOLDOWN_MS`, `TEST_PHONE_CODE = "000000"`
  - `generateCode(): string` (`crypto.randomInt(0, 1_000_000)` com zeros à esquerda)
  - `hashCode(challengeId: string, code: string): string` (HMAC-SHA256 hex com `SESSION_SECRET` via `getEnv()`)
  - `codeMatches(challengeId: string, code: string, codeHash: string): boolean` (`timingSafeEqual`)
  - `type ChallengeInput = { tenantId: string; purpose: "signup" | "login"; personId: string | null; phone: string; channel: OtpChannel; pendingSignup: PendingSignup | null; ip: string; userAgent: string | null }`
  - `reserveChallenge(db, input: ChallengeInput, code: string, now?): Promise<{ blocked: true } | { blocked: false; challenge: OtpCode }>` — gera o id com `randomUUID()`, insere com `code_hash = hashCode(id, code)` e `expires_at = now + 5 min`, conta as linhas da janela por telefone (15 min e 24 h) e por IP (15 min) **incluindo a recém-inserida**, entre todas as clínicas; se estourar, apaga a própria linha e devolve `blocked`

- [ ] **Passo 1: testes que falham**
  - `generateCode` sempre com 6 dígitos (1.000 chamadas);
  - `hashCode` muda com o `challengeId`; `codeMatches` aceita o certo e recusa o errado e um hash de tamanho diferente sem lançar;
  - o hash gravado não contém o código;
  - por telefone: 3 reservas em 15 min passam, a 4ª bloqueia e não deixa linha; com relógio +15 min passa de novo; 10 em 24 h bloqueiam a 11ª;
  - por IP: 10 passam, a 11ª bloqueia (telefones diferentes);
  - limite conta entre clínicas (telefone igual em duas clínicas);
  - **concorrência:** 6 `reserveChallenge` simultâneos (`Promise.all`) para o mesmo telefone → no máximo 3 não bloqueados.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente. **Passo 4:** PASS (mutação: contar antes de inserir faz o teste de concorrência falhar).
- [ ] **Passo 5:** commit "Adiciona geração do código e limites de envio".

---

### Task 8: fluxo de entrada (núcleo)

**Arquivos:**
- Criar: `src/server/auth/entry.ts`
- Testar: `src/server/auth/entry.test.ts`

**Interfaces:**
- Consome: Tasks 1, 5, 6 e 7; `MessagingProvider` (`src/server/adapters/messaging`).
- Produz:
  - `type EntryMeta = SessionMeta`; `type EntryDeps = { messaging: MessagingProvider; testPhones: readonly string[] }`
  - `type CodeSent = { kind: "code-sent"; challengeId: string; maskedPhone: string; channel: OtpChannel; resendAvailableAt: Date }`
  - `type EntryError = { kind: "error"; error: string; restart: boolean }` (`restart = true` manda a tela de volta ao passo do CPF)
  - `startEntry(db, tenantId, input: unknown, meta, deps, now?): Promise<CodeSent | { kind: "needs-signup"; cpf: string } | EntryError>`
  - `startSignup(db, tenantId, input: unknown, origin: LeadOriginParams, meta, deps, now?): Promise<CodeSent | EntryError>`
  - `resendCode(db, tenantId, challengeId: string, input: unknown, meta, deps, now?): Promise<CodeSent | EntryError>`
  - `verifyCode(db, tenantId, challengeId: string, input: unknown, meta, now?): Promise<{ kind: "signed-in"; personId: string; cookieValue: string; expiresAt: Date } | EntryError>`

**Regras** (seções 4.2, 6.2 e 6.3 da spec):
- `startEntry`: CPF existente → desafio `login` para o telefone cadastrado, canal `whatsapp`; senão `needs-signup`.
- `startSignup`: se o CPF já existir (corrida ou formulário adulterado), age como `startEntry` com esse CPF (código para o telefone cadastrado); senão desafio `signup` com `pending_signup` (`termsVersion = TERMS_VERSION`).
- Envio: telefone em `deps.testPhones` → código `000000` e o provedor **não** é chamado; senão `generateCode()` e `deps.messaging.sendOtp({ channel, recipient: phone, code })`. Falha do provedor → `invalidated_at = now` e mensagem de falha (`restart: false`). Bloqueio → mensagem de limite.
- `resendCode`: desafio do `challengeId` precisa ser desta clínica, não consumido; antes de `created_at + 60 s` → "Aguarde para pedir um novo código."; senão invalida o atual e reserva um novo com os mesmos dados e o canal pedido.
- `verifyCode`: incremento atômico de `attempts` com `WHERE id AND tenant_id AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now`; sem linha → "Este código expirou. Peça um novo." (`restart: false`); código errado com `attempts < 5` → "Código incorreto. Restam N tentativas."; errado com `attempts = 5` → invalida e "Você errou o código 5 vezes. Peça um novo."; certo → consumo atômico (`consumed_at IS NULL` no `WHERE`), depois `login`: `markPhoneVerified` + sessão; `signup`: `createLeadFromSignup` + sessão, e em `cpf-taken` abre sessão da pessoa existente só se o telefone for o mesmo, senão "Este CPF já tem cadastro. Entre de novo com seu CPF." com `restart: true`.

- [ ] **Passo 1: testes que falham** (com um `MessagingProvider` falso que guarda os envios e pode lançar)
  - pessoa nova: `startEntry` → `needs-signup`; `startSignup` → `code-sent` com `maskedPhone = "(11) *****-4321"`; `verifyCode` com o código enviado → `signed-in`, pessoa criada como `lead`, dois consentimentos, sessão válida;
  - pessoa existente: `startEntry` envia para o telefone cadastrado; `verifyCode` → sessão sem criar pessoa, `phone_verified_at` preenchido;
  - telefone de teste: provedor não chamado; `000000` funciona;
  - erros: "Restam 4 tentativas." no 1º erro, "Resta 1 tentativa." no 4º, encerra no 5º e o código certo depois disso dá "Este código expirou. Peça um novo."; código expirado (relógio +5 min);
  - **desafio de outra clínica:** `verifyCode(db, outroTenant.id, challengeId, …)` → expirado, sem sessão;
  - reenvio antes de 60 s recusado; depois de 60 s invalida o anterior (código antigo não serve) e respeita o canal `sms`;
  - provedor que lança → mensagem de falha, desafio invalidado, nenhum dado pessoal no `console.error` (espione e confira que CPF e telefone não aparecem);
  - limite de envio → "Muitas tentativas. Tente de novo em alguns minutos.";
  - **consumo simultâneo:** dois `verifyCode` com o código certo em `Promise.all` → exatamente um `signed-in` e uma linha em `person_sessions`;
  - **corrida de CPF:** dois desafios `signup` com o mesmo CPF; confirmar o primeiro e depois o segundo com o mesmo telefone → segundo vira `signed-in` da mesma pessoa; com telefone diferente → `restart: true` e uma pessoa só.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente. **Passo 4:** PASS (mutação: tire `consumed_at IS NULL` do consumo; tire o filtro de `tenant_id`).
- [ ] **Passo 5:** commit "Adiciona o fluxo de entrada com código de verificação".

---

### Task 9: limpeza dos dados novos

**Arquivos:**
- Modificar: `src/server/jobs/cleanup.ts`
- Testar: `src/server/jobs/cleanup.test.ts` (e ajustar `src/app/api/cron/cron-routes.test.ts` se conferir o formato do log)

**Interfaces:**
- Produz: `CleanupResult` ganha `otpCodes: number` e `personSessions: number`; `OTP_RETENTION_HOURS = 24`. Log: `[cleanup] login_attempts=… sessions=… person_sessions=… otp_codes=… sent_messages=…`.

- [ ] **Passo 1:** testes: desafio de 25 h é apagado e o de 23 h fica; sessão de cliente vencida há 31 dias e revogada há 31 dias são apagadas, vencida há 29 dias fica; log só com contagens.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente. **Passo 4:** PASS.
- [ ] **Passo 5:** commit "Limpa códigos e sessões de cliente antigos".

---

### Task 10: telas de entrada e minha conta

**Arquivos:**
- Criar: `src/server/auth/current-client.ts`, `src/app/(public)/[slug]/entrar/page.tsx`, `entrar/entry-flow.tsx`, `entrar/actions.ts`, `entrar/actions.test.ts`, `src/app/(public)/[slug]/minha-conta/page.tsx`, `minha-conta/actions.ts`, `minha-conta/session-refresher.tsx`
- Modificar: `src/app/(public)/[slug]/page.tsx` (cabeçalho)
- Remover: `src/app/(cliente)/` inteira (procure e remova links para `/minha-conta` sem slug)

**Interfaces:**
- Consome: Tasks 1, 2, 5 e 8; `getTenantBySlug`, `getMessagingProvider`, `getEnv`, `clientIp`.
- Produz (`current-client.ts`):
  - `OTP_COOKIE = "egc_otp"`
  - `type CurrentClient = { sessionId: string; person: Pick<Person, "id" | "name" | "cpf" | "phone" | "status">; tenant: Tenant; scope: TenantScope; shouldRenew: boolean }`
  - `getCurrentClient(slug: string): Promise<CurrentClient | null>` (memoizado com `cache`)
  - `requireClient(slug: string, voltar: string): Promise<CurrentClient>` (redireciona para `/<slug>/entrar?voltar=<voltar>`)
  - `beginEntry(slug, input)`, `beginSignup(slug, input)` (lê `egc_origem` com `parseOriginCookie` e passa para `startSignup`), `resendEntryCode(slug, input)` → `Promise<{ ok: true; step: "code"; maskedPhone: string; channel: OtpChannel; resendAvailableAt: string } | { ok: true; step: "signup"; cpf: string } | { ok: false; error: string; restart: boolean }>`; gravam ou trocam o cookie `egc_otp` (`signPayload({ c: challengeId, s: slug }, now + 10 min)`)
  - `completeEntry(slug, input): Promise<{ ok: true } | { ok: false; error: string; restart: boolean }>`: lê `egc_otp` (precisa ter `s === slug`, senão `restart: true` sem consultar), chama `verifyCode`, grava `egc_cliente` e apaga `egc_otp`
  - `refreshClientSession(slug): Promise<void>`, `signOutClient(slug): Promise<void>`
- Actions (`entrar/actions.ts`): `startEntryAction(slug, input)`, `startSignupAction(slug, input)`, `resendCodeAction(slug, input)`, `verifyCodeAction(slug, input, voltar)` → em sucesso `redirect(safeReturnPath(slug, voltar))`; qualquer exceção → log com `describeUnexpectedError` e "Não foi possível continuar. Tente novamente." (`redirect` fora do `try`, como em `admin/login/actions.ts`). `minha-conta/actions.ts`: `signOutAction(slug)` → `redirect(/<slug>)`; `refreshSessionAction(slug)`.

**Telas** (seção 4 da spec, 375 px, padrão visual da página da clínica e do login do admin):
- `entrar/page.tsx`: 404 sem clínica; com sessão válida, `redirect(safeReturnPath(slug, voltar))`; senão renderiza `<EntryFlow slug voltar clinicPhone clinicName />`, com `clinicPhone` = dígitos de `locations.phone` do local ativo ou `null`.
- `entry-flow.tsx` (cliente): estados `cpf` → `signup` → `code`, react-hook-form + schemas da Task 1, `method="post"`, botão desabilitado até hidratar e enquanto envia (`useHydrated`, como no login do admin). Rótulos: "CPF", "Nome", "Celular (WhatsApp)", "Código"; botões "Continuar", "Enviar código", "Entrar". Campo do código com `inputMode="numeric"` e `autoComplete="one-time-code"`. Na etapa do código: texto "Enviamos um código por WhatsApp para (11) *****-1234" (ou "por SMS"); "Reenviar código" e "Receber por SMS" desabilitados até `resendAvailableAt`, com contagem regressiva; "Não reconhece esse número? Fale com a clínica" com link `https://wa.me/55<dígitos>` só quando `clinicPhone` existir; "Trocar CPF". Links dos termos abrem `/<slug>/termos` e `/<slug>/privacidade` em nova aba (`rel="noopener"`). `restart: true` volta à etapa do CPF mostrando a mensagem.
- `minha-conta/page.tsx`: `requireClient(slug, "/<slug>/minha-conta")`; "Olá, <primeiro nome>", CPF com `maskCpf`, celular com `maskPhone`, botão "Sair"; renderiza `<SessionRefresher slug />` só quando `shouldRenew` (efeito único que chama `refreshSessionAction`).
- Catálogo: no cabeçalho, "Minha conta" (com sessão) ou "Entrar" (sem sessão), ao lado de "Instalar app".

- [ ] **Passo 1: testes que falham** (`entrar/actions.test.ts`, no estilo de `admin/login/actions.test.ts`, mockando `next/headers` e `next/navigation`)
  - `verifyCodeAction` com sucesso redireciona para `safeReturnPath` (com `voltar = "//evil.com"` vai para `/easyglowcare/minha-conta`);
  - cookie `egc_otp` emitido para outra clínica → `{ ok: false, restart: true }` sem consultar o banco;
  - exceção inesperada → mensagem genérica e log sem CPF/telefone;
  - `egc_cliente` gravado com `path: "/easyglowcare"`, `httpOnly`, `sameSite: "lax"`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente `current-client.ts`, actions, páginas e componente. **Passo 4:** PASS; `pnpm lint`, `pnpm typecheck` limpos.
- [ ] **Passo 5: verificação manual** em `pnpm dev`, viewport 375 px, com `OTP_TEST_PHONES=11900000001` no `.env.local`: pessoa nova até "Minha conta", sair, entrar de novo só com CPF; pessoa com celular fora da lista recebe o código no terminal (provedor `console`). Clínica sem telefone: apague `locations.phone` no banco local e confira que o link some sem erro.
- [ ] **Passo 6:** commit "Adiciona as telas de entrada e minha conta do cliente".

---

### Task 11: termos e privacidade

**Arquivos:**
- Criar: `src/lib/legal/terms.ts`, `src/app/(public)/[slug]/termos/page.tsx`, `src/app/(public)/[slug]/privacidade/page.tsx`
- Testar: `src/lib/legal/terms.test.ts`

**Interfaces:**
- Produz: `TERMS_VERSION` já existe (Task 1); acrescente `type LegalSection = { title: string; paragraphs: string[] }`, `termsOfUse(clinicName: string): LegalSection[]`, `privacyPolicy(clinicName: string): LegalSection[]`.

Conteúdo (rascunho para revisão jurídica, linguagem simples, pt-BR):
- **Termos de uso:** Sobre este documento; Quem oferece o serviço (a clínica, usando a plataforma EasyGlowCare); Cadastro e código de acesso (CPF, celular, código de uso pessoal); Catálogo e agendamentos (preços e disponibilidade podem mudar; "a partir de" depende de avaliação); Responsabilidades de quem usa; Alterações destes termos.
- **Política de privacidade:** Dados que coletamos (nome, CPF, celular, origem da visita, IP e navegador no aceite); Para que usamos (identificar você, enviar o código, falar sobre seus atendimentos; promoções só com a sua autorização); Com quem compartilhamos (provedores de mensagem e hospedagem, só para operar o serviço); Por quanto tempo guardamos; Seus direitos pela LGPD (acesso, correção, exclusão, revogar o consentimento de marketing, falando com a clínica); Dados de saúde (só serão pedidos em etapas futuras, com consentimento próprio).

- [ ] **Passo 1:** testes: o nome da clínica aparece nos dois textos; nenhuma seção vazia; `TERMS_VERSION === "v1"`.
- [ ] **Passo 2:** FAIL. **Passo 3:** implemente. As páginas mostram título, "Versão v1", um aviso visível "Rascunho em revisão jurídica." e as seções; 404 sem clínica.
- [ ] **Passo 4:** PASS. **Passo 5:** commit "Adiciona rascunho dos termos de uso e da política de privacidade".

---

### Task 12: testes de navegador e CI

**Arquivos:**
- Criar: `e2e/entry.spec.ts`
- Modificar: `e2e/constants.ts`, `e2e/global-setup.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Produz em `e2e/constants.ts`: `E2E_TEST_PHONE = "11900000001"`, `E2E_NEW_CPF = "52998224725"`, `CLIENT_COOKIE_NAME = "egc_cliente"`.

- [ ] **Passo 1:** `global-setup.ts`: depois do seed, `DELETE FROM people WHERE cpf = $1` com `E2E_NEW_CPF` e `DELETE FROM otp_codes WHERE phone = $1 OR ip IN ('127.0.0.1','::1','unknown')` (limites de execuções anteriores); se `OTP_TEST_PHONES` do `.env.local` não incluir `E2E_TEST_PHONE`, lance erro explicando o que adicionar.
- [ ] **Passo 2:** `entry.spec.ts` (usa `test` de `./fixtures`, que derruba o teste em bloqueio de CSP):
  - pessoa nova: `/easyglowcare?utm_source=instagram` → "Entrar" → CPF `529.982.247-25` → nome, celular `(11) 90000-0001`, aceita termos → "Enviamos um código por WhatsApp para (11) *****-0001" → código `000000` → URL `/easyglowcare/minha-conta` com "Olá," → "Sair" → volta ao catálogo com "Entrar";
  - pessoa existente (mesmo CPF, depois do teste anterior): CPF → código `000000` → "Minha conta";
  - erros: CPF `529.982.247-24` → "CPF inválido. Confira os números."; termos desmarcados → mensagem dos termos; código `111111` → "Código incorreto. Restam 4 tentativas.";
  - `/easyglowcare/minha-conta` sem sessão → `/easyglowcare/entrar?voltar=%2Feasyglowcare%2Fminha-conta`.
  - O arquivo envia no máximo **3** códigos ao telefone de teste por execução (cadastro, login, código errado), dentro do limite de 3 em 15 min. O `global-setup` limpa os desafios, então rodar o modo dev e depois o de produção em seguida não estoura o limite. Um teste novo que envie código precisa de outro telefone de teste.
- [ ] **Passo 3:** no `ci.yml`, acrescente `OTP_TEST_PHONES=11900000001` ao `.env.local` de CI.
- [ ] **Passo 4:** `pnpm test:e2e` e `pnpm test:e2e:prod` → PASS (todos os specs, não só o novo).
- [ ] **Passo 5:** commit "Adiciona testes de navegador do fluxo de entrada".

---

### Task 13: documentação

**Arquivos:**
- Modificar: `CLAUDE.md` (seção 4.2), `README.md`, `ROADMAP.md`
- Criar: `docs/superpowers/notes/2026-10-05-mvp-etapa-1-pendencias.md` (só se as revisões deixarem pontos adiados)

- [ ] **Passo 1:** `CLAUDE.md`, na árvore de pastas: troque `app/(cliente)/minha-conta/... # área do cliente` por `app/(public)/[slug]/entrar, minha-conta  # entrada e área do cliente (dentro do endereço da clínica)`. Na seção 8, acrescente `OTP_TEST_PHONES=  # só fora de produção`.
- [ ] **Passo 2:** `README.md`: seção "Testar o cadastro de cliente" (local: `OTP_TEST_PHONES` no `.env.local`, código `000000`, ou código no terminal para outros números; staging: variável só em Preview na Vercel; nunca em Production, o build falha).
- [ ] **Passo 3:** `ROADMAP.md`, "Fluxo de entrada": marque como feitos pré-cadastro, validação de CPF com "continua de onde parou", consentimento LGPD, origem do lead e o código (com a observação "implementação de desenvolvimento; provedor real pendente"); conversão lead → cliente com a observação "regra pronta; disparada na Etapa 3".
- [ ] **Passo 4:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e:prod` → tudo verde.
- [ ] **Passo 5:** commit "Atualiza documentação da Etapa 1".

---

## Depois das tarefas (com o dono)

1. Push do branch e PR para `staging`; CI verde.
2. Na Vercel, `OTP_TEST_PHONES` **só em Preview**.
3. No staging, pelo celular: pessoa nova e pessoa existente com o telefone de teste; conferir no log do build que a migration `0004_people_entry` foi aplicada.
