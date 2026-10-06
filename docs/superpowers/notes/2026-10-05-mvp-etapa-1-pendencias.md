# MVP Etapa 1 (entrada sem senha): pontos adiados pelas revisões

Registrados nas revisões por tarefa e na revisão final do branch `feat/mvp-etapa-1-entrada`.
A rodada de correção final já resolveu: o cookie de origem com `\u0000` ou emoji partido, o limite
por IP antes de procurar o CPF, o telefone conferido no login, o `%` no destino de volta e o texto
"WhatsApp ou SMS" nos termos. O que segue ficou para depois.

## Antes de promover para `main` (produção)

- **Provedor real de WhatsApp/SMS.** Não promova este fluxo para `main` antes de ligar um provedor
  real. Em produção o provedor `console` esconde o código e os telefones de teste
  (`OTP_TEST_PHONES`) são proibidos, então "Entrar" vira um beco sem saída: ninguém recebe o
  código. O mesmo aviso está no ROADMAP (linha "Código de verificação" e "Para colocar o MVP em
  produção"). Esconder o botão em produção exigiria uma decisão de produto.

## Decisões de produto e LGPD

- **Opt-out de marketing do 2º cadastro é descartado.** Se duas pessoas (ou a mesma, duas vezes)
  fazem o cadastro com o mesmo CPF e o mesmo telefone, a segunda confirmação entra na pessoa que já
  existe, e o nome e a escolha de marketing do segundo formulário são ignorados. Se o segundo
  formulário dizia "não quero receber", essa recusa se perde. Decidir se ela deve gravar um novo
  consentimento de marketing negado.
- **IP e user-agent do consentimento.** O consentimento grava o IP e o user-agent da requisição que
  confirma o código, não os do clique na caixa "Aceito". Em geral são o mesmo aparelho, mas não é
  garantido. Decidir com o jurídico se basta ou se é preciso guardar os do envio do formulário (eles
  já ficam no `otp_codes` do desafio, por 24 h).
- **Prazo de guarda** de `otp_codes`, sessões e consentimentos na política de privacidade: o texto
  ainda é rascunho e o prazo é decisão do jurídico.

## Entrada e código (`src/server/auth/entry.ts`, `otp.ts`)

- **Dois códigos vivos.** Um reenvio a partir de um desafio antigo (outra aba) ou dois reenvios em
  paralelo invalidam só o desafio de onde partiram, então dois códigos podem valer ao mesmo tempo.
  Os limites de envio seguram o abuso, mas o ideal é invalidar todos os desafios vivos do mesmo
  telefone e clínica.
- **Consumo sem transação queima o código.** O código é consumido antes de criar a pessoa e a
  sessão. Se a criação falhar (erro de banco), o código já foi gasto e a pessoa precisa pedir
  outro. Resolver junto com o item "Transações no `tenantScope`" do ROADMAP.
- **Reenvio aceita desafio invalidado ou expirado** (não consumido). É de propósito (é quando se
  pede outro), mas vale revisar junto com o item anterior.
- **Linha órfã no bloqueio.** Se o `delete` da própria linha falhar depois de um bloqueio, ela fica
  contando nos limites por 24 h.
- **IP `unknown`.** Sem `x-forwarded-for` (só fora da Vercel), todos os visitantes contam como o
  mesmo IP. Com o limite por IP agora conferido antes do CPF, isso trava todos juntos depois de 10
  envios em 15 min. Na Vercel o cabeçalho sempre vem.

## Pessoas e sessões (`src/server/services/people.ts`, `client-session.ts`)

- `isUniqueViolation` não confere o nome da constraint: qualquer violação de unicidade vira
  "CPF já cadastrado".
- `ConversionReason` é um tipo local em vez de derivar do enum do banco.
- `renewClientSession` e `revokeClientSession` atualizam por id sem o comentário de exceção, e
  `revokeClientSession` não recebe `now`.

## Validação e origem (`src/lib`)

- `pendingSignupSchema` usa `z.string()` simples para CPF e telefone; `maskCpf` e `maskPhone` não
  conferem o tamanho.
- O schema de origem é montado com `Object.fromEntries` e um cast.
- Qualquer primeiro segmento com cara de slug recebe o cookie de origem (por exemplo
  `/login?utm_source=x`). É inofensivo: o cookie só vale naquele caminho.
- Slug codificado que decodifica para o canônico (`/easy%67lowcare`) não é redirecionado.
- `OTP_TEST_PHONES` só com espaços vira `[""]` e dá uma mensagem de erro confusa.

## Telas (`src/app/(public)/[slug]/entrar`)

- Depois de escolher "Receber por SMS" não há volta para WhatsApp, e o link some se o último envio
  já foi por SMS.
- A contagem regressiva do reenvio usa o relógio do aparelho.
- `FieldError` não está ligado ao campo por `aria-describedby`.

## Textos legais (`src/lib/legal/terms.ts`)

- O aviso de rascunho aparece duas vezes (na página e no texto).

## Testes a reforçar

- Testes de CHECK de `people` só cobrem telefone com 10 dígitos (faltam 12 dígitos e DDD com 0).
- Sem teste exato no limite de 7 dias da renovação da sessão.
- `markPhoneVerified` sem teste de outra clínica; o rollback dos consentimentos em
  `createLeadFromSignup` não é exercitado.
- O teste concorrente de `reserveChallenge` aceita 0 envios permitidos.
- Limpeza: o teste de log não confere a linha inteira, e o de `otp_codes` não confere quais linhas
  sobram.
- E2E: os testes dependem da ordem (`workers: 1`) e a asserção do cookie de origem não usa
  `toBeDefined`.

## Documentação e histórico

- `.env.example`: a linha de `OTP_TEST_PHONES` ficou logo depois de `SIGNATURE_PROVIDER`, com
  comentário na mesma linha, e há um bloco `VERCEL_ENV` à parte.
- Uma linha da tabela "Recomendados" do ROADMAP foi apontada como redundante na revisão da T13
  (linha 164 na versão `4112bf6`).
- Alguns commits trazem o trailer `Co-Authored-By` com o modelo que de fato escreveu (Sonnet,
  Haiku) em vez de Opus. Padronizar exige rebase antes do push; ficou como está (Ruling 2).
