export const TERMS_VERSION = "v1";

export type LegalSection = { title: string; paragraphs: string[] };

// RASCUNHO para revisão jurídica. Mudou o texto? Suba TERMS_VERSION.

export function termsOfUse(clinicName: string): LegalSection[] {
  return [
    {
      title: "Sobre este documento",
      paragraphs: [
        "Estes termos explicam as regras para usar o site e o aplicativo de agendamento. Ao criar seu cadastro, você declara que leu e concorda com eles.",
        "Este texto é um rascunho e está em revisão jurídica.",
      ],
    },
    {
      title: "Quem oferece o serviço",
      paragraphs: [
        `O serviço é oferecido por ${clinicName} (a clínica), que usa a plataforma EasyGlowCare para divulgar seus serviços e receber pedidos de agendamento.`,
        `Os atendimentos são prestados pela clínica. Dúvidas sobre eles devem ser tiradas diretamente com ${clinicName}.`,
      ],
    },
    {
      title: "Cadastro e código de acesso",
      paragraphs: [
        "Para se cadastrar, pedimos seu nome, seu CPF e o número do seu celular. Eles devem ser seus e estar corretos.",
        "Não usamos senha. Para entrar, enviamos um código por WhatsApp ou SMS para o celular cadastrado. O código é de uso pessoal: não compartilhe com ninguém, nem com quem diga ser da clínica.",
      ],
    },
    {
      title: "Catálogo e agendamentos",
      paragraphs: [
        "Os preços e a disponibilidade de horários podem mudar sem aviso prévio.",
        'Quando um serviço aparece com preço "a partir de", o valor final depende de uma avaliação feita pela clínica.',
      ],
    },
    {
      title: "Responsabilidades de quem usa",
      paragraphs: [
        "Você se compromete a informar dados verdadeiros, a manter o acesso ao seu celular em segurança e a não usar o serviço de forma que prejudique a clínica, outras pessoas ou o funcionamento do site.",
        `${clinicName} pode suspender um cadastro usado de forma indevida.`,
      ],
    },
    {
      title: "Alterações destes termos",
      paragraphs: [
        "Podemos atualizar estes termos. Cada versão tem um número, e a versão atual aparece no topo desta página.",
        "Se houver mudança importante, pediremos o seu aceite novamente.",
      ],
    },
  ];
}

export function privacyPolicy(clinicName: string): LegalSection[] {
  return [
    {
      title: "Dados que coletamos",
      paragraphs: [
        "No cadastro, coletamos seu nome, seu CPF e o número do seu celular.",
        "Também guardamos de onde veio a sua visita (por exemplo, um link de uma rede social), para a clínica saber como você a encontrou.",
        "No momento em que você aceita estes textos, registramos a data e a hora, a versão aceita, o endereço IP e o navegador usado. Isso serve para comprovar o seu aceite.",
      ],
    },
    {
      title: "Para que usamos",
      paragraphs: [
        `${clinicName} usa seus dados para identificar você, enviar o código de acesso e falar com você sobre os seus atendimentos.`,
        "Mensagens de novidades e promoções só são enviadas por WhatsApp, e somente se você tiver autorizado no cadastro. Você pode mudar de ideia quando quiser.",
      ],
    },
    {
      title: "Com quem compartilhamos",
      paragraphs: [
        "Usamos provedores de hospedagem e de envio de mensagens, e eles recebem os dados apenas para operar o serviço. Seus dados são guardados em servidores no Brasil (São Paulo).",
        "Não vendemos seus dados.",
      ],
    },
    {
      title: "Por quanto tempo guardamos",
      paragraphs: [
        `Guardamos seus dados enquanto você mantiver relacionamento com ${clinicName} e pelo tempo que a lei exigir.`,
        "Se você pedir a exclusão, apagamos ou anonimizamos os dados que a lei permitir.",
      ],
    },
    {
      title: "Seus direitos pela LGPD",
      paragraphs: [
        "Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso aos seus dados, correção de dados errados, e a exclusão ou anonimização deles.",
        "Você também pode revogar a autorização de mensagens de marketing a qualquer momento.",
        `Para exercer esses direitos, fale com ${clinicName}.`,
      ],
    },
    {
      title: "Dados de saúde",
      paragraphs: [
        "Dados de saúde são dados pessoais sensíveis. Neste cadastro, não pedimos nenhum.",
        "Se, em etapas futuras, a clínica precisar deles (por exemplo, em uma ficha de avaliação), eles só serão pedidos com um consentimento próprio, separado deste.",
      ],
    },
  ];
}
