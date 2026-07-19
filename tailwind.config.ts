import type { Config } from 'tailwindcss';

// Tokens de cor vêm de src/theme/themes.css (triplas RGB por tema via data-theme).
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const colorTokens = [
  'surface',
  'surface-dim',
  'surface-bright',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
  'on-surface',
  'on-surface-variant',
  'inverse-surface',
  'inverse-on-surface',
  'outline',
  'outline-variant',
  'surface-tint',
  'primary',
  'on-primary',
  'primary-container',
  'on-primary-container',
  'inverse-primary',
  'secondary',
  'on-secondary',
  'secondary-container',
  'on-secondary-container',
  'tertiary',
  'on-tertiary',
  'tertiary-container',
  'on-tertiary-container',
  'error',
  'on-error',
  'error-container',
  'on-error-container',
  'background',
  'on-background',
  'surface-variant',
  'on-media-accent',
] as const;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // As classes de accent dos grupos de afinidade vêm do banco
  // (feed_affinity_groups.accent) e não aparecem no código-fonte, então o JIT
  // as purgaria e o gradiente do ícone do grupo sumiria. A lista explícita
  // cobre a taxonomia atual; o pattern cobre cores novas da mesma paleta.
  safelist: [
    'from-primary/20',
    'from-amber-500/30',
    'from-rose-500/30',
    'from-red-500/30',
    'from-orange-500/30',
    'from-violet-500/30',
    'from-lime-500/30',
    {
      pattern:
        /^from-(amber|rose|red|orange|violet|lime|emerald|sky|blue|cyan|teal|indigo|purple|fuchsia|pink|green|yellow)-(400|500|600)\/(20|25|30|40)$/,
    },
  ],
  theme: {
    extend: {
      colors: Object.fromEntries(colorTokens.map((t) => [t, token(t)])),
      // Tipografia padrão TikTok para o app inteiro: uma única família sans,
      // hierarquia por peso/tamanho, sentence case (nunca uppercase forçado
      // nem letter-spacing "técnico" nos textos de uso geral). Vale para
      // qualquer tema de cor (preto/azul/laranja) — só a paleta muda por tema.
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Tokens em rem (base 16px) — o tamanho de fonte escolhido em
        // Perfil > Tamanho da fonte muda o font-size raiz do <html>, então
        // qualquer token em px aqui ficaria surdo a esse ajuste.
        // Wordmark / telas de entrada.
        display: ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '800' }],
        // Títulos de página (Perfil, Explorar...).
        'title-lg': ['1.375rem', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
        // Títulos de seção / app bar.
        title: ['1.0625rem', { lineHeight: '1.3', fontWeight: '700' }],
        // @usuario sobre a mídia do post.
        handle: ['1rem', { lineHeight: '1.25', fontWeight: '700' }],
        // Corpo de texto principal (legendas, formulários).
        body: ['0.875rem', { lineHeight: '1.45', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],
        // Botões e pills (Seguir, Assinar, Entrar, Ver perfil).
        label: ['0.8125rem', { lineHeight: '1.2', fontWeight: '600' }],
        // Contadores sob os ícones de ação (curtir, comentar, salvar).
        counter: ['0.75rem', { lineHeight: '1.2', fontWeight: '600' }],
        // Rótulos da tab bar inferior.
        nav: ['0.625rem', { lineHeight: '1.15', fontWeight: '500' }],
        // Cabeçalhos pequenos e discretos de seção (ex.: grupos em Configurações).
        eyebrow: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '600' }],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config;
