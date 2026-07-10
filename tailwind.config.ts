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
] as const;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
        // Wordmark / telas de entrada.
        display: ['32px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '800' }],
        // Títulos de página (Perfil, Explorar...).
        'title-lg': ['22px', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
        // Títulos de seção / app bar.
        title: ['17px', { lineHeight: '1.3', fontWeight: '700' }],
        // @usuario sobre a mídia do post.
        handle: ['16px', { lineHeight: '1.25', fontWeight: '700' }],
        // Corpo de texto principal (legendas, formulários).
        body: ['14px', { lineHeight: '1.45', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        // Botões e pills (Seguir, Assinar, Entrar, Ver perfil).
        label: ['13px', { lineHeight: '1.2', fontWeight: '600' }],
        // Contadores sob os ícones de ação (curtir, comentar, salvar).
        counter: ['12px', { lineHeight: '1.2', fontWeight: '600' }],
        // Rótulos da tab bar inferior.
        nav: ['10px', { lineHeight: '1.15', fontWeight: '500' }],
        // Cabeçalhos pequenos e discretos de seção (ex.: grupos em Configurações).
        eyebrow: ['11px', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '600' }],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config;
