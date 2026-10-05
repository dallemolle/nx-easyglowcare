# Fase 0D: pontos menores adiados pelas revisões

Registrados nas revisões por tarefa e na revisão final do branch `feat/fase-0d-pwa-seguranca-ci`.
A revisão final classificou todos como "pode esperar".

## Antes do SaaS (várias clínicas)

- **Escopo do app instalado sem barra final** (`src/lib/pwa/manifest.ts`). O escopo `/easyglowcare`
  também cobre `/easyglowcare-sp`, então a página de outra clínica abriria dentro do app instalado da
  primeira. Resolver junto com os caminhos reservados: o ROADMAP já tem a linha "Caminhos
  reservados".
- **Slugs iguais a rotas do app.** `icons`, `admin`, `api` e `minha-conta` precisam ser recusados
  como slug de clínica (mesma linha do ROADMAP).

## Deploy e migrations

- **Migrations puladas sem aviso.** Se a opção "Automatically expose System Environment Variables"
  for desligada na Vercel, `VERCEL_ENV` some e o build de produção pula as migrations em silêncio.
  Hoje a opção vem ligada. Uma salvaguarda seria falhar quando `VERCEL` existe e `VERCEL_ENV` não.
- **Testes de `shouldMigrate`.** Não conferem os textos de motivo de staging e de produção (só a
  decisão).
- **Script de migration.** O caminho "URL ausente" de `migrate-on-deploy.ts` só foi conferido à
  mão, sem teste automático.

## CI (`.github/workflows/ci.yml`)

Confirmar no primeiro PR:
- a imagem do proxy do Neon sobe;
- `db.localtest.me` resolve na máquina do GitHub;
- o Chrome está instalado;
- o pnpm 12 é instalado pelo `pnpm/action-setup`.

Para depois:
- O serviço `neon-proxy` não tem verificação de saúde. Se falhar de vez em quando, acrescente um
  passo que espere a porta 4444.
- A imagem de terceiros usa a tag `:main`, e as actions usam tags. Fixar por digest ou SHA quando
  der.

## Service worker

- **Desligar o service worker.** Não há "chave de desligar" documentada: para retirá-lo, publique
  um `sw.js` que remova o próprio registro.
- **Página "Sem conexão".** Se `offline.html` for editado sem trocar `CACHE_NAME` em `sw.js`, a
  cópia guardada no celular não é atualizada.
- **Navigation preload.** Não está ligado, então cada navegação paga a inicialização do service
  worker.

## Telas e testes

- **Instalação pelo menu do navegador.** Com a tela "Instalar app" aberta, instalar pelo menu não
  muda a tela para "já instalado" até recarregar.
- **Teste de instalação no navegador.** Espera `networkidle` antes de simular o convite do
  navegador. Revisar se ficar instável no CI.
- **Testes de ícones.** Conferem o formato PNG, mas não o tamanho em pixels.
- **Verificação da CSP nos testes de navegador.** Abre uma página até em testes que só fazem
  requisições, e só pega bloqueios que aparecem no console. Ouvir o evento
  `securitypolicyviolation` seria mais robusto.
- **Testes faltando.** Não há teste de navegador do texto "outros casos" da tela de instalar.

## Segurança

- **`Permissions-Policy: camera=()`.** Precisa ser revisto se as fotos clínicas forem tiradas pela
  câmera dentro do app (`getUserMedia`). O `<input capture>` não é afetado.
- **CSP do `next dev`.** O script de atualização automática do Turbopack sai sem nonce. O teste de
  segurança ignora só esse script no modo dev; no modo produção, todos os scripts têm nonce.
- **Barra de comentários da Vercel.** Não aparece no staging. Com `'strict-dynamic'`, a CSP não
  libera scripts por domínio, por isso a liberação para Preview foi retirada. A spec do 0D ainda
  menciona essa liberação; vale a decisão registrada aqui.
- **Outros arquivos de `public/`.** O proxy também roda neles (por exemplo um futuro
  `robots.txt`): só acrescenta um cabeçalho desnecessário.

## Documentação

- **README, "Neon + Vercel".** A introdução diz que a lista vale para qualquer deploy, mas os passos
  4 e 5 (clínica e primeiro dono) só se aplicam ao primeiro.
