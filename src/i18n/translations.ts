// Dicionários de tradução. Para adicionar um idioma: crie o dicionário aqui,
// exporte-o em `dictionaries` e inclua o código em `SUPPORTED_LANGUAGES`
// (I18nProvider.tsx) — nenhum outro arquivo precisa mudar.

const pt = {
  'profile.member': 'Membro',
  'profile.professional': 'Profissional',
  'profile.createPost': 'Criar post',
  'profile.shareProfile': 'Compartilhar perfil',
  'profile.editAvatar': 'Trocar foto de perfil',
  'profile.settingsTitle': 'Central de Configurações',

  'profile.section.preferences': 'Preferências',
  'profile.section.account': 'Conta',
  'profile.section.navigation': 'Navegação',
  'profile.section.professional': 'Profissional',
  'profile.section.session': 'Sessão',

  'profile.messages.title': 'Mensagens',
  'profile.messages.description': 'Sua caixa de entrada',

  'profile.language.title': 'Idioma',

  'profile.fontSize.title': 'Tamanho da fonte',

  'profile.theme.title': 'Tema do aplicativo',

  'profile.editProfile.title': 'Editar Perfil',
  'profile.editProfile.description': 'Dados pessoais, endereços e contatos',

  'profile.payment.title': 'Formas de Pagamento',
  'profile.payment.description': 'Cartões, PIX e endereços de cobrança',

  'profile.health.title': 'Perfil de Saúde',
  'profile.health.description': 'Declarações, registros clínicos e exames',

  'profile.market.title': 'Mercado',
  'profile.market.description': 'Produtos e serviços à venda',

  'profile.becomeProfessional.title': 'Tornar-me profissional',
  'profile.becomeProfessional.description':
    'Ativa sua conta profissional: criar conteúdo para assinantes, vender, gerir negócios, comunidades e desafios. Desativar volta para membro sem perder nada.',

  'profile.affinity.title': 'Grupos de afinidade',
  'profile.affinity.description': 'Escolha até 3 áreas em que você atua como profissional.',
  'profile.affinity.limit': 'Você pode escolher no máximo 3 grupos.',

  'profile.management.title': 'Gestão',
  'profile.management.description': 'Painel de operação profissional',

  'profile.business.title': 'Meus negócios',
  'profile.business.description': 'Organizações e contratos',

  'profile.terms.title': 'Privacidade e Termos',
  'profile.terms.description': 'Consentimento LGPD e termos de uso',

  'profile.signOut.title': 'Sair',
  'profile.signOut.titleLoading': 'Saindo...',
  'profile.signOut.description': 'Encerrar a sessão neste aparelho',
} as const;

const en: Record<keyof typeof pt, string> = {
  'profile.member': 'Member',
  'profile.professional': 'Professional',
  'profile.createPost': 'Create post',
  'profile.shareProfile': 'Share profile',
  'profile.editAvatar': 'Change profile photo',
  'profile.settingsTitle': 'Settings Center',

  'profile.section.preferences': 'Preferences',
  'profile.section.account': 'Account',
  'profile.section.navigation': 'Navigation',
  'profile.section.professional': 'Professional',
  'profile.section.session': 'Session',

  'profile.messages.title': 'Messages',
  'profile.messages.description': 'Your inbox',

  'profile.language.title': 'Language',

  'profile.fontSize.title': 'Font size',

  'profile.theme.title': 'App theme',

  'profile.editProfile.title': 'Edit Profile',
  'profile.editProfile.description': 'Personal data, addresses and contacts',

  'profile.payment.title': 'Payment Methods',
  'profile.payment.description': 'Cards, PIX and billing addresses',

  'profile.health.title': 'Health Profile',
  'profile.health.description': 'Declarations, medical records and exams',

  'profile.market.title': 'Market',
  'profile.market.description': 'Products and services for sale',

  'profile.becomeProfessional.title': 'Become a professional',
  'profile.becomeProfessional.description':
    'Turns on your professional account: create subscriber content, sell, manage businesses, communities and challenges. Turning it off returns you to member without losing anything.',

  'profile.affinity.title': 'Affinity groups',
  'profile.affinity.description': 'Pick up to 3 areas you work in as a professional.',
  'profile.affinity.limit': 'You can pick at most 3 groups.',

  'profile.management.title': 'Management',
  'profile.management.description': 'Professional operation dashboard',

  'profile.business.title': 'My businesses',
  'profile.business.description': 'Organizations and contracts',

  'profile.terms.title': 'Privacy & Terms',
  'profile.terms.description': 'LGPD consent and terms of use',

  'profile.signOut.title': 'Sign out',
  'profile.signOut.titleLoading': 'Signing out...',
  'profile.signOut.description': 'End the session on this device',
};

export const dictionaries = { pt, en };

export type TranslationKey = keyof typeof pt;
