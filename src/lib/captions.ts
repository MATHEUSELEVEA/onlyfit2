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

// Cue ativo no instante atual do vídeo (linear — usado no preview do editor).
export function activeCue(cues: CaptionCue[], time: number): CaptionCue | null {
  for (const cue of cues) {
    if (time >= cue.start && time < cue.end) return cue;
  }
  return null;
}

/**
 * Saneia as falas: descarta inválidas/vazias, ordena por início e RECORTA
 * sobreposições (o fim de uma nunca ultrapassa o início da próxima). Garante
 * que no máximo uma fala está ativa em cada instante — sem flicker de borda
 * nem duas legendas simultâneas. Fonte única de verdade antes de exibir/salvar.
 */
export function sanitizeCues(cues: CaptionCue[]): CaptionCue[] {
  const clean = cues
    .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.text.trim().length > 0)
    .map((c) => ({ start: Math.max(0, c.start), end: c.end, text: c.text.trim() }))
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < clean.length - 1; i += 1) {
    if (clean[i].end > clean[i + 1].start) clean[i] = { ...clean[i], end: clean[i + 1].start };
  }
  return clean.filter((c) => c.end > c.start);
}

/**
 * Índice da fala ativa em `time`, otimizado por cursor: testa a última fala e
 * as vizinhas (O(1) no caso comum de avanço quadro a quadro) e, só se preciso,
 * cai numa busca binária (O(log n)). Exige cues saneadas/ordenadas. -1 = nenhuma.
 */
export function findCueIndex(cues: CaptionCue[], time: number, hint: number): number {
  const inside = (i: number) => i >= 0 && i < cues.length && time >= cues[i].start && time < cues[i].end;
  if (inside(hint)) return hint;
  if (inside(hint + 1)) return hint + 1;
  if (inside(hint - 1)) return hint - 1;
  let lo = 0;
  let hi = cues.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return candidate >= 0 && time < cues[candidate].end ? candidate : -1;
}
