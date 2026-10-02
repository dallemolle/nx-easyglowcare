# ROADMAP.md — O que dá para fazer com Vercel + Neon, e o que vai para o backlog

Legenda usada em todos os itens:

- **[VN]** Dá para fazer 100% com Vercel + Neon (e bibliotecas gratuitas).
- **[VN+A]** O código é todo feito agora em Vercel + Neon, atrás de um adapter com modo `console`/`mock`. Para funcionar **em produção** precisa de um provedor externo (listado na seção 4).
- **[EXT]** Depende de outro ambiente, conta ou serviço. Vai para o backlog.

---

## 0. Pré-requisito importante: plano da Vercel

- O plano **Hobby** da Vercel é para uso pessoal e **não comercial**. Um app de clínica que cobra clientes é uso comercial, então **produção precisa do plano Pro** (US$ 20 por membro/mês, com crédito de uso incluso). Para desenvolver, o Hobby serve.
- No Hobby, **Cron roda no máximo 1 vez por dia** e com precisão de ±59 min. Lembretes de 24h e 2h, lista de espera e fila de mensagens exigem cron a cada poucos minutos → **Pro** (cron por minuto) ou um agendador externo.
- Neon: criar o projeto em **São Paulo (`aws-sa-east-1`)**. A região não muda depois de criada.

---

## 1. Fase 0 — Fundação (tudo [VN])

- [x] Repositório Next.js + TypeScript + Tailwind + shadcn/ui + Drizzle
- [ ] Projeto Neon em `aws-sa-east-1`, integração Vercel ↔ Neon com branch por preview (código pronto; falta criar o projeto e conectar à Vercel)
- [x] Functions na região `gru1`
- [x] Schema multi-tenant (`tenants`, `locations`), helper de escopo por tenant
- [x] Rotas `/[slug]` (site público), `/minha-conta` (cliente), `/admin` (clínica)
- [x] Login da equipe (e-mail + senha com Argon2, ou link mágico quando houver e-mail)
- [x] Permissões: dono, recepção, profissional
- [x] Adapters com implementação `console`/`mock`: mensagens, pagamento, assinatura
- [x] Tabela `message_outbox` + rota `/api/cron/outbox` (cron diário no Hobby; ver "Recomendados")
- [ ] `audit_log`, seed da "EasyGlowCare", CI (lint, typecheck, testes) (seed e `audit_log` feitos; CI pendente no 0D)
- [ ] PWA: manifest, ícones, service worker, tela "instalar app"

## 2. MVP

### Fluxo de entrada (diferencial)
| Item | Tag | Observação |
|---|---|---|
| Pré-cadastro sem senha (nome, CPF, telefone) → lead + catálogo liberado | [VN] | |
| Validação e máscara de CPF, checagem de duplicidade ("continua de onde parou") | [VN] | Validação só por dígito verificador. Consulta de situação na Receita = [EXT] |
| Consentimento LGPD com data, hora, IP, versão do texto | [VN] | |
| Origem do lead (Instagram, indicação, Google, UTM) | [VN] | Captura de `utm_*` e `ref` em cookie na 1ª visita |
| Conversão lead → cliente no 1º agendamento/pagamento/atendimento | [VN] | |
| Código de verificação por WhatsApp/SMS (também serve de login) | [VN+A] | Dev: código aparece no console. Produção: provedor WhatsApp/SMS |

### Catálogo
| Item | Tag |
|---|---|
| Categorias (facial, corporal, depilação, injetáveis, capilar) | [VN] |
| Página do serviço: fotos, duração, preço/"a partir de", indicações, contraindicações, cuidados | [VN] (fotos no Vercel Blob público) |
| Busca e filtros (preço, duração, área do corpo, profissional) | [VN] (Postgres full-text + `unaccent`) |
| Botão "Tenho interesse / quero avaliação" → cria tarefa no CRM | [VN] |

### Agendamento online
| Item | Tag |
|---|---|
| Agenda em tempo real por serviço, profissional, sala e equipamento | [VN] (restrição de exclusão no Postgres) |
| "Qualquer profissional disponível" ou profissional preferida | [VN] |
| Bloqueio de horários (folga, feriado, manutenção) | [VN] |
| Intervalo de higienização entre atendimentos | [VN] |
| Vários serviços em sequência no mesmo horário | [VN] |
| Remarcar/cancelar pelo cliente dentro do prazo configurável | [VN] |

### Lembretes
| Item | Tag |
|---|---|
| Confirmação automática do agendamento | [VN+A] |
| Lembrete 24h e 2h antes com "Confirmar" / "Remarcar" | [VN+A] + **Vercel Pro** (cron frequente) |
| Orientações pré-procedimento (texto por serviço) | [VN+A] |
| Notificação push no PWA | [VN] (Web Push/VAPID, sem serviço pago; no iPhone só com o app instalado na tela inicial) |
| E-mail de confirmação | [VN+A] (Resend, disponível no Marketplace da Vercel) |

### Área do cliente (básica)
| Item | Tag |
|---|---|
| Próximos agendamentos e histórico | [VN] |
| Favoritos e "agendar de novo" | [VN] |
| Avaliação do atendimento (nota + comentário) | [VN] |

### Admin (básico)
| Item | Tag |
|---|---|
| Agenda visual dia/semana/profissional com arrastar e soltar | [VN] (FullCalendar ou componente próprio com dnd-kit) |
| Cadastro de serviços, preços, duração, profissionais habilitados, salas, equipamentos | [VN] |
| Lista de leads e clientes com busca | [VN] |

**Para colocar o MVP em produção você precisa de:** Vercel Pro, um provedor de WhatsApp (ou SMS) para o código e os lembretes, e um provedor de e-mail. Todo o resto já roda com o que você tem.

## 3. Versão 2

| Item | Tag | Observação |
|---|---|---|
| Sinal por Pix no agendamento | [VN+A] | Gateway com Pix + webhook |
| Pagamento online Pix/cartão, parcelado em pacotes | [VN+A] | Gateway |
| Política de falta/cancelamento tardio com retenção do sinal | [VN] | Regra interna; estorno parcial via gateway |
| Pacotes e combos com desconto | [VN] | |
| Saldo de pacotes ("restam 4 de 10") com baixa automática | [VN] | Ledger de sessões |
| Agendamento recorrente (sessões semanais do pacote) | [VN] | |
| Lista de espera com aviso automático de vaga | [VN+A] | Mensagem via provedor |
| Cupons e códigos promocionais | [VN] | |
| Anamnese digital antes da 1ª visita | [VN] | Campos por modelo (JSON schema), dados criptografados |
| Termo de consentimento com assinatura | [VN] / [EXT] | Aceite eletrônico com registro = [VN]. Assinatura com certificado/validade jurídica maior = [EXT] |
| CRM de leads: funil novo → contatado → avaliação → cliente, tarefas | [VN] | Kanban |
| Financeiro básico: caixa, contas a pagar/receber, fluxo de caixa | [VN] | Sem emissão fiscal |
| Pós-procedimento (mensagem no dia seguinte) | [VN+A] | |

## 4. Versão 3

| Item | Tag | Observação |
|---|---|---|
| Prontuário/ficha técnica (produtos, lote, parâmetros, fotos) | [VN] | Fotos em Blob **privado**, URL assinada, `audit_log` |
| Fotos da evolução na área do cliente | [VN] | Blob privado |
| Galeria antes e depois (com autorização de imagem) | [VN] | Blob público só após consentimento específico |
| Estoque com baixa automática por procedimento e alerta de validade | [VN] | Alerta diário por cron |
| Comissões por profissional | [VN] | |
| Venda de produtos com retirada na clínica | [VN+A] | Pagamento via gateway |
| Vale-presente (gift card) | [VN+A] | |
| Carteira de créditos e cashback | [VN] | Ledger |
| Programa de indicação | [VN] | Link com código `ref` |
| Campanhas por segmento (inativos 60 dias, aniversariantes, por serviço) | [VN+A] | Segmentação no SQL, envio pelo provedor |
| Recuperação de inativos com oferta automática | [VN+A] | Regras fixas agora; com IA = [EXT] |
| Mensagem de aniversário | [VN+A] | |
| Aviso de retorno/manutenção ("hora de retocar") | [VN+A] | Intervalo configurado por serviço |
| Pedido de avaliação no Google | [VN+A] | Envia o link do perfil; não precisa de API |
| Link de agendamento para bio do Instagram e Google Maps | [VN] | |
| Relatórios: ocupação, faltas, conversão por origem, faturamento, ticket médio, LTV, mais vendidos, horários de pico | [VN] | Views SQL + gráficos (Recharts) |
| Clube de assinatura mensal | [VN+A] | Gateway com cobrança recorrente |

## 5. Backlog — precisa de outros ambientes

| Item | O que exige |
|---|---|
| Agendamento pelo WhatsApp com IA | WhatsApp Cloud API + API de IA (Claude) + webhook na Vercel |
| Recuperação de inativos com IA | API de IA |
| Integração com Google Agenda das profissionais | Projeto no Google Cloud, OAuth, verificação do app pelo Google |
| App nativo (iOS/Android) | Expo + EAS, conta Apple Developer (anual) e Google Play (taxa única) |
| Emissão de nota fiscal de serviço (NFS-e) | Emissor fiscal via API + certificado digital A1 da clínica |
| Assinatura digital com validade jurídica ampliada | ZapSign, Clicksign ou D4Sign |
| Vários locais (rede de clínicas) | [VN] no código (já previsto com `locations`); só depende de priorizar |
| SaaS multissegmento (modelos por segmento, campos personalizados, página por negócio) | [VN] no código; cobrança do SaaS precisa de gateway com recorrência |
| Planos e cobrança do SaaS por nº de profissionais | Gateway com assinatura + portal de faturamento |
| Vários idiomas, modo escuro, acessibilidade | [VN] (next-intl, tema do shadcn) — só priorização |

---

## 6. Recursos adicionais recomendados (detalhe)

### Essenciais para produção
| Necessidade | Recomendação | Alternativas | Quando | Notas |
|---|---|---|---|---|
| Hospedagem comercial + cron frequente | **Vercel Pro** | Agendador externo chamando `/api/cron/*` | MVP | Hobby é não comercial e só aceita cron diário |
| WhatsApp (código, confirmação, lembretes) | **WhatsApp Cloud API (Meta)** direto ou via BSP | Twilio, Zenvia, Gupshup, 360dialog | MVP | Exige conta Business verificada, número dedicado e templates aprovados. Cobrança por conversa/mensagem de template; categoria "autenticação" para OTP. **Evite APIs não oficiais** (risco de banimento do número) |
| SMS (fallback do código) | Twilio ou Zenvia | Amazon SNS | MVP | Útil quando o cliente não tem WhatsApp |
| E-mail transacional | **Resend** (instala pelo Marketplace da Vercel) | Postmark, Amazon SES | MVP | Precisa de domínio próprio com SPF/DKIM |
| Domínio próprio | Vercel Domains ou registro.br | — | MVP | |
| Pagamentos (Pix, cartão, parcelado, recorrência) | **Asaas** ou **Mercado Pago** | Efí, Pagar.me, Stripe | V2 | Critérios: taxa do Pix, parcelamento, recorrência (clube), split (comissões) e estorno parcial. Asaas é forte em Pix + recorrência; Mercado Pago é conhecido do público |

### Recomendados (qualidade e segurança)
| Necessidade | Recomendação | Quando | Notas |
|---|---|---|---|
| Monitoramento de erros | **Sentry** (plano gratuito) | MVP | Configurar para **não** enviar dados pessoais |
| Métricas de uso e performance | Vercel Web Analytics + Speed Insights | MVP | Já faz parte da Vercel |
| Rate limit do OTP e do login | **Upstash Redis** (Marketplace da Vercel) | MVP/V2 | Até lá, contagem em tabela do Postgres |
| Fila com horário exato e novas tentativas | **Upstash QStash** ou **Inngest** | V2 | Opcional; o outbox + cron do Pro resolve no começo |
| Backup/restauração | Recuperação por ponto no tempo do Neon (plano pago) | Antes de dados reais | Verificar a janela de retenção do plano escolhido |
| Defesa em profundidade no isolamento | RLS do Postgres por tenant | Antes de dados reais | Helper de aplicação já existe; RLS exige transação por request |
| Retenção dos registros de login e das sessões | Feito no 0C: `/api/cron/cleanup` apaga `login_attempts` e `sessions` com mais de 30 dias e mensagens enviadas há mais de 90 | Feito | Prazo de guarda do `audit_log` é decisão do dono, com orientação jurídica; hoje nunca é apagado |
| Fila de mensagens a cada 5 minutos | Trocar o agendamento de `/api/cron/outbox` para `*/5 * * * *` | Antes da Etapa 4 (exige Vercel Pro) | Hoje a fila roda uma vez por dia, limite do Hobby |
| Tela de consulta da auditoria | Listar o `audit_log` no painel, com filtro por pessoa e período | MVP (com prontuário e preços) | Hoje a consulta é direto no banco |
| Proteção contra bots no pré-cadastro | Vercel Firewall / Bot protection, ou Cloudflare Turnstile | MVP | Evita gastar mensagens de OTP com bots |
| Política de bloqueio de login | Rever o bloqueio (limite por e-mail+IP com teto maior por e-mail) e criar comando de desbloqueio | Antes de clínicas reais | Hoje 5 senhas erradas travam um e-mail conhecido por 15 min, de qualquer IP: qualquer pessoa pode manter um dono travado |
| Headers de segurança e CSP | Configurar no `next.config` (X-Frame-Options, nosniff, Referrer-Policy e CSP) | 0D | Já exigido pelo CLAUDE.md |
| Transações no `tenantScope` | Executar operações compostas em transação | Antes de clínicas reais | Regra do último dono e vínculo de profissional sem condição de corrida |
| Helper único para Server Actions autenticadas | `requireStaff` + renovação da sessão num só lugar | MVP | Antes de o MVP criar dezenas de actions |
| Robustez da fila antes dos lembretes | Isolar o erro por mensagem, limite de tempo por envio e por execução no processador; erro sem dado pessoal ao enfileirar | Antes da Etapa 4 | Hoje um erro de banco no meio do lote interrompe a execução, e um provedor lento pode estourar os 60 s |
| Guarda das mensagens que falharam | Definir prazo para apagar mensagens `failed` (guardam destinatário e conteúdo) | Antes da Etapa 4 | Hoje nunca são apagadas, para investigação |
| Comando para criar clínica | `tenant:create` para criar uma clínica em produção sem usar o seed | Antes de clínicas reais | Hoje só o seed cria clínica (e apaga e recria a de exemplo) |

### Para fases futuras
| Necessidade | Recomendação | Fase |
|---|---|---|
| IA (WhatsApp, recuperação de inativos, resumos) | Claude API via Vercel AI SDK | Backlog |
| Assinatura digital | ZapSign / Clicksign / D4Sign | V2–V3 |
| Nota fiscal de serviço | Focus NFe, NFE.io ou eNotas + certificado A1 | V3 |
| Google Agenda | Google Cloud (OAuth) | Backlog |
| App nativo | Expo + EAS, contas Apple e Google | Backlog |

### Jurídico/regulatório (não é infra, mas trava lançamento)
- Política de privacidade e termos de uso revisados por advogado (LGPD, dados de saúde).
- Definir o encarregado (DPO) e o canal de atendimento ao titular.
- Prazo de guarda de prontuário: se houver procedimentos médicos (ex.: injetáveis), verificar as regras do conselho profissional aplicável.

---

## 7. Prompts para colar no Claude Code (um por etapa)

> Abra o chat do Claude Code no VS Code na pasta do projeto. Ele já lê o `CLAUDE.md`. Cole um prompt por vez e revise o plano antes de aprovar.

**Etapa 0 — Fundação**
```
Leia CLAUDE.md e ROADMAP.md. Execute a Fase 0 do ROADMAP. Antes de codar, entre em modo de planejamento e me mostre: estrutura de pastas, pacotes a instalar, primeiras tabelas do schema Drizzle e ordem de implementação. Crie .env.example, seed da "EasyGlowCare" e o helper de escopo por tenant com teste.
```

**Etapa 1 — Entrada sem senha**
```
Implemente o "Fluxo de entrada" do MVP: pré-cadastro (nome, CPF, telefone), validação e máscara de CPF, duplicidade que retoma o cadastro, consentimento LGPD com registro, captura de UTM/origem, envio e verificação de OTP pelo MessagingProvider (modo console), sessão por cookie e limite de tentativas. Escreva testes Vitest para CPF e OTP e um teste Playwright do fluxo completo em 375px.
```

**Etapa 2 — Catálogo**
```
Implemente o catálogo público em /[slug]: categorias, página do serviço, busca com filtros e o botão "quero avaliação" que cria tarefa no CRM. Imagens em Vercel Blob público. Admin: CRUD de categorias e serviços.
```

**Etapa 3 — Agenda**
```
Implemente o motor de disponibilidade e o agendamento: horários de trabalho, bloqueios, buffer de higienização, recursos (profissional, sala, equipamento) com restrição de exclusão no Postgres, "qualquer profissional", serviços em sequência, remarcar/cancelar dentro do prazo. Teste concorrência: duas reservas simultâneas no mesmo horário devem resultar em só uma confirmada.
```

**Etapa 4 — Lembretes**
```
Implemente o outbox de mensagens: templates, agendamento de confirmação, lembrete 24h e 2h com links "Confirmar"/"Remarcar" assinados, orientações pré-procedimento, e a rota /api/cron/outbox protegida por CRON_SECRET. Adicione Web Push (VAPID) como canal. Deixe o vercel.json com cron a cada 5 min e um comentário explicando que exige plano Pro.
```

**Etapa 5 — Área do cliente e admin básico**
```
Implemente /minha-conta (próximos, histórico, favoritos, agendar de novo, avaliação) e a agenda visual do admin por dia/semana/profissional com arrastar e soltar, respeitando as permissões dos perfis.
```

Depois do MVP, siga a mesma lógica para cada bloco da V2 e V3, sempre pedindo o plano antes.
