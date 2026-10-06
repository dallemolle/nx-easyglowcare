# MVP, Etapa 1: entrada sem senha (design)

- **Data:** 05/10/2026
- **Status:** aprovada
- **Referências:** `CLAUDE.md` (seções 1, 4, 5, 6 e 7), `ROADMAP.md` (MVP, "Fluxo de entrada"), specs do 0A, 0B, 0C e 0D; nota `docs/superpowers/notes/2026-10-02-fase-0c-pendencias.md` (código OTP oculto no staging)

## 1. Contexto e objetivo

A Fase 0 está em produção: base multi-tenant, login da equipe, fila de mensagens, adapters, auditoria, PWA, CSP e CI. O catálogo de cada clínica já aparece em `/<slug>` para qualquer visitante.

A Etapa 1 entrega o diferencial do produto: a pessoa entra só com CPF, nome e celular, confirma o celular com um código de 6 dígitos e passa a ter uma conta, sem senha. O mesmo código serve de login nas visitas seguintes.

A Etapa 1 está pronta quando:
- uma pessoa nova vai do catálogo até "Minha conta" informando CPF, nome, celular e o código, e vira **lead** com consentimentos e origem gravados;
- uma pessoa já cadastrada entra só com CPF e código;
- quem digita o CPF de outra pessoa não vê nenhum dado dela além do final do telefone;
- o fluxo funciona no staging com telefones de teste, sem provedor real de WhatsApp/SMS;
- existe a regra de serviço que converte lead em cliente, pronta para a Etapa 3 (agendamento).

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Catálogo continua aberto.** O cadastro só é pedido quando a pessoa quer entrar (nesta etapa, pelo link "Entrar"; nas próximas, também por "Agendar" e "Tenho interesse") | Entrada sem atrito; o lead nasce quando há interesse real; o catálogo continua visível para buscadores |
| D2 | **Código obrigatório já no cadastro.** O lead só é criado depois de confirmar o celular | Telefone confirmado, sem leads falsos nem CPF alheio; resolve o "CPF já existe" sem expor dados (LGPD); o login fica pronto junto |
| D3 | **Fluxo único que começa pelo CPF.** CPF conhecido → código para o telefone cadastrado; CPF novo → cadastro → código | A pessoa não precisa saber se já tem conta. O CPF é único por clínica e o telefone não (mãe e filha podem dividir o número) |
| D4 | **Quem trocou de número fala com a clínica.** A tela do código mostra "Não reconhece esse número? Fale com a clínica" | Troca de telefone sem verificação abriria a conta de outra pessoa. A tela da recepção para trocar o telefone fica para a etapa do admin |
| D5 | **Telefones de teste com código fixo** (`OTP_TEST_PHONES`, código `000000`), proibidos em produção | Permite testar no staging e no Playwright sem provedor e sem registrar código em log |
| D6 | **Dois consentimentos no cadastro**: termos de uso + política de privacidade (obrigatório) e marketing por WhatsApp (opcional, desmarcado). Uso de imagem fica para o atendimento | Consentimento específico exigido pela LGPD; pedir uso de imagem a quem só olha o catálogo gera desconfiança |
| D7 | **Textos de termos e privacidade padrão da plataforma, versionados no código** (`v1`), com o nome da clínica. Rascunho marcado "a revisar por advogado" | Texto por clínica fica para depois; a revisão jurídica já está no ROADMAP como item que trava o lançamento |
| D8 | **Área do cliente dentro do endereço da clínica**: `/<slug>/entrar` e `/<slug>/minha-conta`. O `/minha-conta` sem slug é removido | O app instalado (0D) tem escopo `/<slug>`; fora dele o celular sai do modo app. A clínica fica clara pelo endereço. Pronto para o SaaS (uma pessoa, várias clínicas). Exige atualizar a estrutura de pastas no `CLAUDE.md` |
| D9 | **Sessão do cliente separada da sessão da equipe**: tabela `person_sessions` e cookie `egc_cliente` | Um cookie de cliente nunca abre o painel, mesmo com bug de permissão. A autenticação da equipe quase não muda |
| D10 | **Limites de envio contados em `otp_codes`**, com a linha gravada antes do envio | Sem tabela nova; mesmo padrão de `login_attempts`, que fecha a corrida de requisições simultâneas |
| D11 | **Sessão do cliente vale 30 dias e é renovada com o uso** | O cliente entra pouco e pelo celular; 7 dias (como na equipe) pediria código o tempo todo |
| D12 | **Conversão lead → cliente só como função de serviço** nesta etapa | Ainda não há agendamento, pagamento nem atendimento para dispará-la |

## 3. Escopo

**Dentro:**
- tabelas `people`, `person_consents`, `otp_codes` e `person_sessions` (uma migration);
- validação e máscara de CPF e celular;
- fluxo `/<slug>/entrar` (CPF, cadastro, código), `/<slug>/minha-conta` mínima e "Sair";
- páginas `/<slug>/termos` e `/<slug>/privacidade` (texto `v1`);
- captura de origem (`utm_*` e `ref`) no `proxy.ts`;
- limites de envio, telefones de teste, limpeza no cron diário;
- link "Entrar" / "Minha conta" no cabeçalho do catálogo;
- `convertLeadToClient` (serviço, sem tela);
- atualização de `CLAUDE.md`, `README`, `ROADMAP` e `.env.example`.

**Fora:**
- botões "Agendar" e "Tenho interesse" nos serviços (Etapas 2 e 3);
- provedor real de WhatsApp/SMS (fica atrás do adapter que já existe);
- telas de admin: lista de leads, troca de telefone pela recepção, CRM (`lead_stages`, `lead_events`, `tasks`);
- e-mail e data de nascimento no cadastro (as colunas existem, mas não são pedidas);
- consentimento de uso de imagem (a coluna aceita o tipo `image`, mas nenhuma tela o pede);
- exportar e excluir meus dados (direitos do titular, etapa própria);
- criptografia de CPF e telefone (precisam ser buscáveis e únicos; a criptografia do `CLAUDE.md` é para dados de saúde);
- textos de termos por clínica.

## 4. Telas e fluxo

### 4.1 Páginas

| Página | O que faz |
|---|---|
| `/<slug>/entrar` | Fluxo em etapas: CPF → cadastro (se CPF novo) → código. Aceita `?voltar=<caminho>` (só caminhos dentro de `/<slug>`; qualquer outro valor é ignorado) |
| `/<slug>/minha-conta` | Exige sessão de cliente desta clínica. Mostra "Olá, <primeiro nome>", CPF mascarado (`***.456.789-**`), telefone mascarado e o botão "Sair" |
| `/<slug>/termos`, `/<slug>/privacidade` | Texto da versão atual com o nome da clínica |
| `/<slug>` (catálogo) | Cabeçalho ganha "Entrar" (sem sessão) ou "Minha conta" (com sessão) |

Com sessão válida, `/<slug>/entrar` redireciona direto para o destino (`voltar` ou `minha-conta`).

### 4.2 Passo a passo

1. **CPF.** Campo com máscara `000.000.000-00`, validado (dígito verificador) no navegador e no servidor.
   - CPF cadastrado nesta clínica: cria o desafio de login, envia o código e mostra "Enviamos um código por WhatsApp para (11) *****-1234".
   - CPF novo: vai para o passo 2, com o CPF já preenchido.
2. **Cadastro.** Nome (2 a 100 caracteres), celular com máscara `(99) 99999-9999` (só celular: DDD válido e 9 na frente), "Li e aceito os Termos de Uso e a Política de Privacidade" (obrigatório, com links que abrem em nova aba) e "Quero receber novidades e promoções por WhatsApp" (opcional, desmarcado). Ao enviar, cria o desafio de cadastro e envia o código.
3. **Código.** Campo de 6 dígitos com `inputmode="numeric"` e `autocomplete="one-time-code"`. Também mostra:
   - "Reenviar código", liberado após 60 s;
   - "Receber por SMS", que reenvia pelo outro canal (mesmas regras do reenvio);
   - "Não reconhece esse número? Fale com a clínica", com link para o WhatsApp do telefone do local ativo (`locations.phone`), escondido se a clínica não tiver telefone;
   - "Trocar CPF", que volta ao passo 1.

   Com o código certo: no cadastro, cria o lead e grava os consentimentos e a origem; nos dois casos, marca `phone_verified_at`, abre a sessão e redireciona.

### 4.3 Origem do lead

O `proxy.ts` (que já roda em toda página) grava o cookie `egc_origem` quando:
- o caminho é `/<slug>` ou está dentro dele, fora das rotas internas já excluídas;
- o endereço tem pelo menos um de `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` ou `ref`;
- o cookie ainda não existe (primeiro toque vence).

O cookie guarda esses parâmetros em JSON (cada valor cortado em 100 caracteres), `path=/<slug>`, 30 dias, `httpOnly`, `sameSite=lax`. Não é assinado: o conteúdo vem do próprio visitante, e o servidor o valida com Zod ao ler.

No cadastro, a origem vira `people.source`:

| Condição (na ordem) | `source` |
|---|---|
| `ref` presente | `referral` |
| `utm_source` contém `instagram` ou é `ig` (sem diferenciar maiúsculas) | `instagram` |
| `utm_source` contém `google` | `google` |
| Nenhum parâmetro | `direct` |
| Qualquer outro caso | `other` |

Os valores brutos vão para as colunas `utm_*` e `ref`.

## 5. Dados

Uma migration. Todas as tabelas usam `tenantColumns()` (id, datas e `tenant_id` com cascade), índice em `tenant_id` e `UNIQUE (tenant_id, id)` para chaves estrangeiras compostas, no padrão do 0B.

### 5.1 `people` (`src/server/db/schema/people.ts`)

| Coluna | Tipo | Regra |
|---|---|---|
| `status` | enum `person_status` (`lead`, `client`) | padrão `lead` |
| `name` | text | obrigatório |
| `cpf` | text | obrigatório; `CHECK cpf ~ '^[0-9]{11}$'` |
| `phone` | text | obrigatório; `CHECK phone ~ '^[1-9]{2}9[0-9]{8}$'` |
| `email` | text | opcional |
| `birth_date` | date | opcional |
| `phone_verified_at` | timestamptz | opcional |
| `converted_at` | timestamptz | opcional |
| `conversion_reason` | enum `conversion_reason` (`appointment`, `payment`, `attendance`) | opcional |
| `source` | enum `lead_source` (`instagram`, `google`, `referral`, `direct`, `other`) | obrigatório |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `ref` | text | opcionais |

Restrições: `UNIQUE (tenant_id, cpf)`, índice em `(tenant_id, phone)`, e `CHECK` de que `status = 'client'` exige `converted_at` e `conversion_reason`.

### 5.2 `person_consents` (no mesmo arquivo)

`person_id` (FK composta com `people`, cascade), `kind` (enum `consent_kind`: `terms`, `marketing`, `image`), `version` (text), `granted` (boolean), `ip`, `user_agent`. Só recebe inserções: retirar um consentimento é uma linha nova com `granted = false`. O estado atual de cada tipo é a linha mais recente. Índice em `(person_id, kind, created_at)`.

No cadastro são gravadas duas linhas: `terms` com `granted = true` e `marketing` com o valor marcado (true ou false). O termo de uso e a política de privacidade dividem a mesma versão e a mesma linha (`terms`).

### 5.3 `otp_codes` (`src/server/db/schema/auth.ts`)

| Coluna | Tipo | Regra |
|---|---|---|
| `purpose` | enum `otp_purpose` (`signup`, `login`) | obrigatório |
| `person_id` | uuid | obrigatório no `login`, nulo no `signup` (`CHECK`); FK composta com `people`, cascade |
| `phone` | text | obrigatório (destino e contagem dos limites) |
| `channel` | enum `message_channel` do 0C, restrito a `whatsapp` e `sms` por `CHECK` | obrigatório |
| `code_hash` | text | HMAC-SHA256 de `<id do desafio>:<código>` com `SESSION_SECRET` |
| `expires_at` | timestamptz | criação + 5 min |
| `attempts` | integer | padrão 0; máximo 5 |
| `consumed_at` | timestamptz | preenchido ao acertar |
| `invalidated_at` | timestamptz | preenchido no reenvio ou ao esgotar as tentativas |
| `ip`, `user_agent` | text | da requisição |
| `pending_signup` | jsonb | só no `signup`: nome, CPF, telefone, marketing (boolean), versão dos termos e origem. Nulo no `login` (`CHECK`) |

Índices em `(phone, created_at)` e `(ip, created_at)` para os limites.

Por que HMAC e não sha256 simples: com só um milhão de códigos possíveis, um sha256 seria revertido em segundos por quem tivesse uma cópia do banco. Com o id do desafio no HMAC, o mesmo código em dois desafios gera hashes diferentes.

`pending_signup` guarda dado pessoal por no máximo 24 h (ver limpeza, seção 6.6).

### 5.4 `person_sessions` (`src/server/db/schema/auth.ts`)

Igual a `sessions`, trocando `staff_user_id` por `person_id` (FK composta com `people`, cascade): `token_hash` (único), `expires_at`, `revoked_at`, `ip`, `user_agent`.

## 6. Segurança, limites e erros

### 6.1 Componentes

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/br/cpf.ts` | `isValidCpf`, `normalizeCpf` (só dígitos), `formatCpf`, `maskCpf` (`***.456.789-**`). Rejeita sequências repetidas |
| `src/lib/br/phone.ts` | `isValidMobile`, `normalizePhone`, `formatPhone` (`(11) 98765-1234`), `maskPhone` (`(11) *****-1234`) |
| `src/lib/validation/entry.ts` | Schemas Zod de CPF, cadastro e código, compartilhados entre o formulário e as actions |
| `src/lib/lead-origin.ts` | Lê e valida o cookie de origem e calcula `source` |
| `src/lib/legal/terms.ts` | Versão atual (`TERMS_VERSION = "v1"`) e textos de termos e privacidade com o nome da clínica |
| `src/server/auth/token.ts` | Extraído de `session.ts`: gerar token, calcular hash, assinar e verificar cookie com `jose`. A sessão da equipe passa a usá-lo sem mudar de comportamento |
| `src/server/auth/otp.ts` | Criar desafio (com limites), verificar código, reenviar, ler o desafio do cookie `egc_otp` |
| `src/server/auth/client-session.ts` | `createClientSession`, `validateClientSession`, `renewClientSession`, `revokeClientSession` |
| `src/server/auth/current-client.ts` | `getCurrentClient(slug)` e `requireClient(slug, voltar)` |
| `src/server/services/people.ts` | `findPersonByCpf`, `createLeadFromSignup` (pessoa + consentimentos numa transação: `db.transaction((tx) => …tenantScope(tx, tenantId)…)`; o `Pool` do Neon aceita transações e `tenantScope` recebe qualquer `PgDatabase`), `convertLeadToClient` |
| `src/app/(public)/[slug]/entrar/*` | Página, formulário em etapas (componente cliente) e server actions |
| `src/app/(public)/[slug]/minha-conta/*` | Página e action de sair |
| `src/app/(public)/[slug]/termos/page.tsx`, `privacidade/page.tsx` | Textos legais |

### 6.2 Limites de envio

Cada desafio criado ou reenviado é uma linha em `otp_codes`, gravada **antes** do envio. Depois de inserir, a função conta as linhas da janela; se algum limite estourou, apaga a própria linha e devolve "bloqueado" (mesmo padrão de `reserveLoginAttempt`).

| Limite | Valor |
|---|---|
| Por telefone | 3 em 15 min e 10 em 24 h |
| Por IP | 10 em 15 min (alto de propósito: operadoras móveis põem muitas pessoas no mesmo IP) |
| Reenvio | só 60 s depois da criação do desafio atual (o do cookie `egc_otp`). O reenvio cria um desafio novo com os mesmos dados (finalidade, pessoa ou `pending_signup`, e o canal escolhido), marca `invalidated_at` no anterior e troca o cookie |

Os limites são contados entre clínicas (o telefone e o IP são os mesmos para um atacante, qualquer que seja a clínica). A consulta usa `db` direto, como `rate-limit.ts`, com comentário explicando a exceção ao `tenantScope`.

Mensagem de limite: "Muitas tentativas. Tente de novo em alguns minutos." Não diz qual limite estourou.

### 6.3 Verificação do código

- Lê o desafio pelo cookie `egc_otp` (JWT assinado com `{ desafio, slug }`, `path=/<slug>`, 10 min, `httpOnly`, `sameSite=lax`). O desafio precisa ser da clínica do endereço.
- Desafio expirado, consumido ou invalidado → "Este código expirou. Peça um novo."
- Incrementa `attempts` de forma atômica **antes** de comparar. Se passar de 5, invalida e responde "Você errou o código 5 vezes. Peça um novo."
- Compara os HMACs com `timingSafeEqual`.
- Código errado → "Código incorreto. Restam N tentativas."
- Código certo → `UPDATE … SET consumed_at = now() WHERE id = … AND consumed_at IS NULL AND invalidated_at IS NULL RETURNING`. Se nenhuma linha voltar, outra requisição já consumiu, e esta responde como expirado. Assim, dois envios simultâneos do mesmo código abrem uma sessão só.
- **Cadastro:** cria pessoa e consentimentos numa transação. Se o `UNIQUE (tenant_id, cpf)` falhar (outra pessoa confirmou o mesmo CPF antes), não grava nada, busca a pessoa existente e **só abre a sessão se o telefone confirmado for o mesmo da pessoa existente**. Se for diferente, responde "Este CPF já tem cadastro. Entre de novo com seu CPF" e volta ao passo 1 (o código irá para o telefone cadastrado).
- Marca `phone_verified_at` (no cadastro, já na criação), cria a sessão, apaga o cookie `egc_otp` e redireciona.

### 6.4 Telefones de teste

- `OTP_TEST_PHONES`: lista de celulares (só dígitos, separados por vírgula), validada no `getEnv`.
- Para esses números, o código é sempre `000000` e o provedor não é chamado. Os limites continuam valendo.
- **`getEnv` lança erro se `OTP_TEST_PHONES` estiver preenchida e `VERCEL_ENV === "production"`** (`VERCEL_ENV` entra no schema do `getEnv` como opcional; a Vercel a define sozinha). O build de produção quebra em vez de subir com essa porta aberta.
- Vai para o `.env.example` (vazia), para as variáveis de Preview da Vercel e para o README (como testar no staging).

### 6.5 Sessão do cliente

- Cookie `egc_cliente`: JWT assinado com o token, `httpOnly`, `secure` em produção, `sameSite=lax`, `path=/<slug>`, 30 dias.
- `validateClientSession` busca por `token_hash`, exige `revoked_at` nulo, validade futura e **`tenant_id` igual ao da clínica do endereço**. Renova quando faltar menos de 7 dias.
- `requireClient(slug, voltar)` redireciona para `/<slug>/entrar?voltar=<caminho>` quando não há sessão válida.
- "Sair" revoga a sessão e apaga o cookie.
- O painel continua lendo só `egc_session`. Nenhum código do admin conhece `egc_cliente`.

### 6.6 Limpeza (cron diário que já existe, `src/server/jobs/cleanup.ts`)

- Apaga `otp_codes` com `created_at` há mais de 24 h (leva junto o `pending_signup`).
- Apaga `person_sessions` vencidas ou revogadas há mais de 30 dias.
- Loga só as contagens, como hoje.

### 6.7 Privacidade

- Telefone sempre mascarado na tela; a tela do código nunca mostra nome nem CPF.
- **Risco aceito:** quem digita um CPF cadastrado descobre que ele é cliente da clínica e vê os 4 últimos dígitos do telefone. É o mínimo para o fluxo funcionar; o limite por IP restringe a varredura, e o código continua indo só para o telefone cadastrado.
- Nada de CPF, telefone completo, nome ou código em log. Erros inesperados são logados com `describeUnexpectedError` (0C).

### 6.8 Mensagens de erro

Todas em português, sem detalhes técnicos:

| Situação | Mensagem |
|---|---|
| CPF inválido | "CPF inválido. Confira os números." |
| Celular inválido | "Informe um celular com DDD, como (11) 98765-4321." |
| Termos não aceitos | "Para continuar, aceite os Termos de Uso e a Política de Privacidade." |
| Código errado | "Código incorreto. Restam N tentativas." |
| Código expirado, consumido ou esgotado | "Este código expirou. Peça um novo." / "Você errou o código 5 vezes. Peça um novo." |
| Limite de envio | "Muitas tentativas. Tente de novo em alguns minutos." |
| Falha do provedor | "Não conseguimos enviar o código agora. Tente de novo em instantes." (o desafio é invalidado) |
| Cookie `egc_otp` ausente ou de outra clínica | volta ao passo 1 |

### 6.9 Conversão lead → cliente

`convertLeadToClient(scope, personId, reason)` muda `status` para `client` e preenche `converted_at` e `conversion_reason` só se a pessoa ainda for `lead`. Chamar de novo não muda nada (idempotente), e um cliente nunca volta a ser lead. Nesta etapa não há quem a chame.

## 7. Testes

**Unitários (Vitest, sem banco):**
- CPF: dígito verificador, sequências repetidas, normalização, formatação e máscara;
- celular: DDD válido, 9 na frente, normalização, formatação e máscara;
- origem: tabela da seção 4.3, cookie inválido ignorado, valores cortados;
- código: 6 dígitos, HMAC dependente do desafio, comparação;
- `getEnv`: `OTP_TEST_PHONES` aceita fora de produção e lança com `VERCEL_ENV=production`;
- `voltar`: só aceita caminhos dentro de `/<slug>`.

**Integração (Vitest + Postgres do Docker, como no 0B e 0C):**
- cadastro completo: desafio → código certo → lead com consentimentos, origem e sessão;
- login: CPF existente → código → sessão, sem criar pessoa;
- 5 erros encerram o desafio; código expirado; reenvio invalida o anterior; reenvio antes de 60 s é recusado;
- limites por telefone e por IP, incluindo envios simultâneos que não furam o limite;
- consumo simultâneo do mesmo código abre uma só sessão;
- dois cadastros simultâneos com o mesmo CPF: uma pessoa só; o segundo vira login se o telefone for o mesmo e volta ao passo 1 se for outro;
- sessão de outra clínica não vale; sessão revogada ou vencida não vale; renovação perto do vencimento;
- `convertLeadToClient`: converte, é idempotente e não volta para lead;
- limpeza apaga desafios e sessões antigos e mantém os recentes;
- sessão da equipe continua passando nos testes do 0B depois da extração de `token.ts`.

**Navegador (Playwright, 375 px, no CI em modo produção como no 0D, com `OTP_TEST_PHONES` no ambiente do CI):**
- pessoa nova: catálogo → Entrar → CPF → cadastro → código `000000` → Minha conta → Sair;
- pessoa existente: CPF → código → Minha conta;
- erros visíveis: CPF inválido, termos não marcados, código errado.

## 8. Documentação

- `CLAUDE.md`, seção 4.2: trocar `app/(cliente)/minha-conta/...` pela área do cliente dentro de `app/(public)/[slug]/` (`entrar`, `minha-conta`).
- `.env.example`: `OTP_TEST_PHONES=` com comentário "só fora de produção".
- `README`: como testar o cadastro no staging com telefone de teste.
- `ROADMAP.md`: marcar como feitos os itens da Etapa 1 entregues (pré-cadastro, CPF, consentimento, origem, conversão como regra de serviço, código com implementação de desenvolvimento).
- Pontos adiados pelas revisões: `docs/superpowers/notes/`.

## 9. Critério de pronto

- typecheck, lint e testes limpos; CI verde;
- fluxo testado no staging pelo celular (375 px) com um telefone de teste, pessoa nova e pessoa existente;
- migration aplicada sozinha no build do staging;
- `CLAUDE.md`, `README`, `ROADMAP` e `.env.example` atualizados.
