import { useState } from 'react';
import { Globe, Loader2, Lock, MapPin, Play, Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { FilterChip } from '@/components/ui/FilterChip';
import { useAffinityGroups } from '@/lib/sports';
import type { DraftMedia, PostLocation } from '../media';
import { useLocationSearch } from '../useLocationSearch';
import type { PostVisibility } from '../useCreatePost';

interface DetailsStepProps {
  media: DraftMedia[];
  caption: string;
  onCaptionChange: (value: string) => void;
  sports: string[];
  onToggleSport: (key: string) => void;
  location: PostLocation | null;
  onLocationChange: (value: PostLocation | null) => void;
  visibility: PostVisibility;
  onVisibilityChange: (value: PostVisibility) => void;
  canPublishToMembers: boolean;
  canPublish: boolean;
  onPublish: () => boolean;
}

// Campo de localização: chip quando selecionada; senão, busca com resultados.
function LocationField({ location, onChange }: { location: PostLocation | null; onChange: (v: PostLocation | null) => void }) {
  const [query, setQuery] = useState('');
  const { results, loading } = useLocationSearch(query);

  if (location) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
        <MapPin size={18} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans text-label text-on-surface">{location.name}</span>
          {location.secondary ? <span className="block truncate font-sans text-body-sm text-on-surface-variant">{location.secondary}</span> : null}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Remover localização" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-transform active:scale-90">
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-container-low px-3">
        <Search size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar um lugar…"
          className="min-h-[44px] w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:outline-none"
        />
        {loading ? <Loader2 size={16} className="shrink-0 animate-spin text-on-surface-variant motion-reduce:animate-none" aria-hidden /> : null}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-outline-variant/20 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container">
          {results.map((place, i) => (
            <li key={`${place.name}-${i}`}>
              <button
                type="button"
                onClick={() => { onChange({ name: place.name, secondary: place.secondary, lat: place.lat, lon: place.lon }); setQuery(''); }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors active:bg-surface-container-high"
              >
                <MapPin size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-label text-on-surface">{place.name}</span>
                  {place.secondary ? <span className="block truncate font-sans text-body-sm text-on-surface-variant">{place.secondary}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'paid_members', label: 'Assinantes', icon: Lock },
];

const CAPTION_MAX = 2200;

export function DetailsStep({
  media,
  caption,
  onCaptionChange,
  sports,
  onToggleSport,
  location,
  onLocationChange,
  visibility,
  onVisibilityChange,
  canPublishToMembers,
  canPublish,
  onPublish,
}: DetailsStepProps) {
  const { groups } = useAffinityGroups();
  // A fila de publicação roda fora da tela, mas o botão só fica consumido
  // depois que o enfileiramento realmente foi aceito. Assim, um perfil ainda
  // carregando nunca deixa a tela travada em estado enviado.
  const [submitted, setSubmitted] = useState(false);
  const cover = media[0];

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {/* Capa + legenda lado a lado (estilo Instagram): contexto do que se
            está publicando enquanto escreve. */}
        <div className="flex gap-3">
          {cover && (
            <div className="relative h-24 w-[76px] shrink-0 overflow-hidden rounded-xl bg-surface-container">
              {cover.kind === 'video' ? (
                <>
                  <video src={cover.previewUrl} className="h-full w-full object-cover" muted preload="metadata" />
                  <span className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"><Play size={11} fill="currentColor" aria-hidden /></span>
                </>
              ) : (
                <img src={cover.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
              {media.length > 1 && (
                <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 font-sans text-nav text-white backdrop-blur-sm">
                  1/{media.length}
                </span>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              rows={4}
              maxLength={CAPTION_MAX}
              placeholder="Escreva uma legenda…"
              className="h-24 w-full resize-none rounded-xl border border-outline-variant/50 bg-surface-container-low p-3 text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
            <div className="mt-1 text-right font-sans text-nav tabular-nums text-on-surface-variant">
              {caption.length}/{CAPTION_MAX}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <span className="font-sans text-label text-on-surface">Modalidades</span>
          <div className="flex flex-wrap gap-2">
            {groups.map((sport) => (
              <FilterChip
                key={sport.key}
                active={sports.includes(sport.key)}
                onClick={() => onToggleSport(sport.key)}
              >
                {sport.label}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="font-sans text-label text-on-surface">Localização</span>
          <LocationField location={location} onChange={onLocationChange} />
        </div>

        {canPublishToMembers && (
        <div className="space-y-2">
          <span className="font-sans text-label text-on-surface">Quem pode ver</span>
          <div className="grid grid-cols-2 gap-2">
            {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onVisibilityChange(value)}
                aria-pressed={visibility === value}
                className={clsx(
                  'flex min-h-[48px] items-center justify-center gap-2 rounded-xl border font-sans text-label transition-colors',
                  visibility === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-outline-variant/50 bg-surface text-on-surface-variant',
                )}
              >
                <Icon size={18} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={() => {
            if (submitted) return;
            if (onPublish()) setSubmitted(true);
          }}
          disabled={submitted || !canPublish}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-primary font-sans text-label text-on-primary transition-opacity enabled:active:opacity-90 disabled:opacity-60"
        >
          {submitted ? (
            <>
              <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
              Publicando…
            </>
          ) : (
            'Publicar'
          )}
        </button>
      </div>
    </div>
  );
}
