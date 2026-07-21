import { useMemo, useRef, useState } from 'react';
import { Check, Loader2, Wand2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { supabase } from '@/lib/supabase';
import { uploadAsset } from '../upload';
import { fileExtension } from '../media';
import { CaptionOverlay } from '@/features/feed/CaptionOverlay';
import {
  CAPTION_COLORS,
  CAPTION_PRESETS,
  DEFAULT_CAPTION_STYLE,
  sanitizeCues,
  type CaptionColor,
  type CaptionCue,
  type CaptionPosition,
  type CaptionSize,
  type CaptionStyle,
  type CaptionTrack,
} from '@/lib/captions';
import type { DraftMedia } from '../media';

// Distribui as linhas digitadas uniformemente ao longo da duração do vídeo.
// (Slice 2 substitui isto por cues com tempo real da auto-transcrição.)
function linesToCues(text: string, duration: number): CaptionCue[] {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || duration <= 0) return [];
  const slot = duration / lines.length;
  return lines.map((line, i) => ({ start: +(i * slot).toFixed(2), end: +((i + 1) * slot).toFixed(2), text: line }));
}

const SIZES: { value: CaptionSize; label: string }[] = [
  { value: 'sm', label: 'P' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'G' },
];
const POSITIONS: { value: CaptionPosition; label: string }[] = [
  { value: 'top', label: 'Topo' },
  { value: 'center', label: 'Meio' },
  { value: 'bottom', label: 'Base' },
];

export function CaptionEditor({ media, value, onSave, onClose }: { media: DraftMedia; value: CaptionTrack | null; onSave: (track: CaptionTrack | null) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [text, setText] = useState(() => (value?.cues ?? []).map((c) => c.text).join('\n'));
  const [style, setStyle] = useState<CaptionStyle>(value?.style ?? DEFAULT_CAPTION_STYLE);
  const [duration, setDuration] = useState(0);
  // Cues com tempo real vindos da auto-transcrição (preservam o timing exato
  // enquanto o nº de linhas bater; ao mudar o nº de linhas, cai na distribuição
  // uniforme). Slice 2.
  const [autoCues, setAutoCues] = useState<CaptionCue[] | null>(value?.cues ?? null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState<string | null>(null);

  const cues = useMemo(() => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const raw = autoCues && autoCues.length === lines.length
      ? autoCues.map((c, i) => ({ ...c, text: lines[i] }))
      : linesToCues(text, duration || 1);
    return sanitizeCues(raw);
  }, [text, duration, autoCues]);
  const previewTrack: CaptionTrack = { cues, style };

  // Auto-transcrição sob demanda (espera condicional): só roda se o criador
  // pedir. Sobe o clipe pro R2, dispara a transcrição no Cloudflare e faz poll.
  const autoTranscribe = async () => {
    if (transcribing) return;
    setTranscribing(true);
    setTranscribeMsg(null);
    try {
      const ext = fileExtension(media.file) || 'mp4';
      const url = await uploadAsset(media.file, `caption_src_${Date.now()}.${ext}`, media.file.type || 'video/mp4', 'onlyfit-media');
      const { data: started } = await supabase.functions.invoke<{ uid?: string }>('transcribe-clip', { body: { source_url: url } });
      const uid = started?.uid;
      if (!uid) throw new Error('start failed');
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const { data } = await supabase.functions.invoke<{ status?: string; cues?: CaptionCue[] }>('transcribe-clip', { body: { uid, action: 'captions' } });
        if (data?.status === 'ready') {
          const result = data.cues ?? [];
          if (result.length > 0) {
            setAutoCues(result);
            setText(result.map((c) => c.text).join('\n'));
          } else {
            setTranscribeMsg('Não identifiquei fala no vídeo — escreva manualmente.');
          }
          return;
        }
      }
      setTranscribeMsg('A transcrição demorou. Tente de novo ou escreva manualmente.');
    } catch {
      setTranscribeMsg('Não consegui transcrever agora — escreva manualmente.');
    } finally {
      setTranscribing(false);
    }
  };

  const save = () => onSave(cues.length > 0 ? { cues, style } : null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-2 py-2 pt-safe-top">
        <button type="button" onClick={onClose} aria-label="Cancelar" className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-transform active:scale-95"><X size={22} aria-hidden /></button>
        <span className="font-sans text-title text-white">Legendas</span>
        <button type="button" onClick={save} aria-label="Salvar legendas" className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-transform active:scale-95"><Check size={24} aria-hidden /></button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          src={media.previewUrl}
          className="h-full w-full object-cover"
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        />
        {cues.length > 0 && <CaptionOverlay track={previewTrack} videoRef={videoRef} active />}
      </div>

      <div className="space-y-4 border-t border-white/10 bg-black px-4 pb-safe-bottom pt-4">
        <button
          type="button"
          onClick={autoTranscribe}
          disabled={transcribing}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 font-sans text-label text-white transition-opacity disabled:opacity-60"
        >
          {transcribing ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Wand2 size={18} aria-hidden />}
          {transcribing ? 'Transcrevendo…' : 'Transcrever automaticamente'}
        </button>
        {transcribeMsg && <p className="font-sans text-body-sm text-white/70">{transcribeMsg}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Digite a legenda (uma frase por linha)…"
          className="w-full resize-none rounded-xl border border-white/20 bg-white/5 p-3 font-sans text-body text-white placeholder:text-white/50 focus:border-primary focus:outline-none"
        />

        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {CAPTION_PRESETS.map((preset) => (
            <button key={preset.value} type="button" onClick={() => setStyle((s) => ({ ...s, preset: preset.value }))} className={clsx('shrink-0 rounded-full px-3 py-1.5 font-sans text-counter transition-colors', style.preset === preset.value ? 'bg-white text-black' : 'bg-white/10 text-white')}>{preset.label}</button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Cor */}
          <div className="flex gap-1.5">
            {CAPTION_COLORS.map((c) => (
              <button key={c.value} type="button" onClick={() => setStyle((s) => ({ ...s, color: c.value as CaptionColor }))} aria-label={c.label} className={clsx('h-7 w-7 rounded-full border-2 transition-transform active:scale-90', style.color === c.value ? 'border-primary' : 'border-white/30')} style={{ backgroundColor: c.swatch }} />
            ))}
          </div>
          <span className="h-6 w-px bg-white/15" aria-hidden />
          {/* Tamanho */}
          <div className="flex gap-1.5">
            {SIZES.map((sz) => (
              <button key={sz.value} type="button" onClick={() => setStyle((s) => ({ ...s, size: sz.value }))} className={clsx('h-7 w-7 rounded-full font-sans text-counter transition-colors', style.size === sz.value ? 'bg-white text-black' : 'bg-white/10 text-white')}>{sz.label}</button>
            ))}
          </div>
          <span className="h-6 w-px bg-white/15" aria-hidden />
          {/* Posição */}
          <div className="flex gap-1.5">
            {POSITIONS.map((p) => (
              <button key={p.value} type="button" onClick={() => setStyle((s) => ({ ...s, position: p.value }))} className={clsx('shrink-0 rounded-full px-2.5 py-1 font-sans text-counter transition-colors', style.position === p.value ? 'bg-white text-black' : 'bg-white/10 text-white')}>{p.label}</button>
            ))}
          </div>
        </div>

        <button type="button" onClick={save} className="mb-2 min-h-[48px] w-full rounded-full bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90">
          Salvar legendas
        </button>
      </div>
    </div>
  );
}
