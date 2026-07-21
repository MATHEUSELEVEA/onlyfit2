// Modelo de legenda AUTORAL de vídeo (estilo TikTok/CapCut): falas com tempo +
// estilo escolhido pelo criador. Renderizadas como overlay sincronizado no
// player (não "queimadas" no arquivo — mesmo efeito visual, sempre visíveis,
// sem re-encodar). Guardadas em posts.metadata.captions / stories.metadata.

export interface CaptionCue {
  /** segundos */
  start: number;
  /** segundos */
  end: number;
  text: string;
}

export type CaptionPreset = 'classic' | 'bold' | 'outline' | 'boxed' | 'minimal';
export type CaptionSize = 'sm' | 'md' | 'lg';
export type CaptionColor = 'white' | 'yellow' | 'brand' | 'black';
export type CaptionPosition = 'bottom' | 'center' | 'top';

export interface CaptionStyle {
  preset: CaptionPreset;
  size: CaptionSize;
  color: CaptionColor;
  position: CaptionPosition;
}

export interface CaptionTrack {
  cues: CaptionCue[];
  style: CaptionStyle;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'boxed',
  size: 'md',
  color: 'white',
  position: 'bottom',
};

export const CAPTION_PRESETS: { value: CaptionPreset; label: string }[] = [
  { value: 'classic', label: 'Clássico' },
  { value: 'bold', label: 'Negrito' },
  { value: 'outline', label: 'Contorno' },
  { value: 'boxed', label: 'Com fundo' },
  { value: 'minimal', label: 'Simples' },
];

export const CAPTION_COLORS: { value: CaptionColor; label: string; swatch: string }[] = [
  { value: 'white', label: 'Branco', swatch: '#FFFFFF' },
  { value: 'yellow', label: 'Amarelo', swatch: '#FFE44D' },
  { value: 'brand', label: 'Lima', swatch: '#CAF300' },
  { value: 'black', label: 'Preto', swatch: '#111111' },
];

const SIZE_CLASS: Record<CaptionSize, string> = {
  sm: 'text-[3.6vw] leading-tight',
  md: 'text-[4.6vw] leading-tight',
  lg: 'text-[5.8vw] leading-tight',
};

const COLOR_TEXT: Record<CaptionColor, string> = {
  white: 'text-white',
  yellow: 'text-[#FFE44D]',
  brand: 'text-[#CAF300]',
  black: 'text-[#111111]',
};

const POSITION_CLASS: Record<CaptionPosition, string> = {
  top: 'items-start pt-[18%]',
  center: 'items-center',
  bottom: 'items-end pb-[24%]',
};

// Classe do container (alinhamento vertical) por posição.
export function captionContainerClass(style: CaptionStyle): string {
  return POSITION_CLASS[style.position];
}

// Classe do texto por preset + tamanho + cor. Legenda vive SOBRE o vídeo (fundo
// escuro), então usa cores concretas de decoração de mídia — mesma exceção do
// texto branco do feed. Presets combinam peso, sombra/contorno e fundo.
export function captionTextClass(style: CaptionStyle): string {
  const base = `inline-block max-w-[86%] whitespace-pre-wrap break-words px-1 font-sans ${SIZE_CLASS[style.size]} ${COLOR_TEXT[style.color]}`;
  switch (style.preset) {
    case 'classic':
      return `${base} font-semibold [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]`;
    case 'bold':
      return `${base} font-extrabold uppercase tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.9)]`;
    case 'outline':
      return `${base} font-extrabold [-webkit-text-stroke:1.5px_rgba(0,0,0,0.9)] [paint-order:stroke_fill]`;
    case 'boxed':
      return `${base} rounded-lg bg-black/60 px-2.5 py-1 font-semibold backdrop-blur-sm`;
    case 'minimal':
      return `${base} font-medium [text-shadow:0_1px_3px_rgba(0,0,0,0.7)]`;
    default:
      return base;
  }
}

// Cue ativo no instante atual do vídeo.
export function activeCue(cues: CaptionCue[], time: number): CaptionCue | null {
  for (const cue of cues) {
    if (time >= cue.start && time < cue.end) return cue;
  }
  return null;
}
