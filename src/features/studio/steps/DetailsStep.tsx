import { Loader2, Lock, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { FilterChip } from '@/components/ui/FilterChip';
import { useAffinityGroups } from '@/lib/sports';
import type { PostVisibility } from '../useCreatePost';

interface DetailsStepProps {
  caption: string;
  onCaptionChange: (value: string) => void;
  sports: string[];
  onToggleSport: (key: string) => void;
  visibility: PostVisibility;
  onVisibilityChange: (value: PostVisibility) => void;
  canPublishToMembers: boolean;
  onPublish: () => void;
  isPublishing: boolean;
  error: string | null;
}

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Público', icon: Globe },
  { value: 'paid_members', label: 'Assinantes', icon: Lock },
];

export function DetailsStep({
  caption,
  onCaptionChange,
  sports,
  onToggleSport,
  visibility,
  onVisibilityChange,
  canPublishToMembers,
  onPublish,
  isPublishing,
  error,
}: DetailsStepProps) {
  const { groups } = useAffinityGroups();

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <label className="block space-y-2">
          <span className="font-sans text-label text-on-surface">Legenda</span>
          <textarea
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            rows={4}
            maxLength={2200}
            placeholder="Escreva uma legenda…"
            className="w-full resize-none rounded-xl border border-outline-variant/50 bg-surface-container-low p-3 text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </label>

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

        {error && (
          <p role="alert" className="rounded-lg bg-error-container p-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-outline-variant/40 p-4">
        <button
          type="button"
          onClick={onPublish}
          disabled={isPublishing}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary transition-opacity active:opacity-90 disabled:opacity-60"
        >
          {isPublishing && <Loader2 size={18} className="animate-spin" aria-hidden />}
          {isPublishing ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    </div>
  );
}
