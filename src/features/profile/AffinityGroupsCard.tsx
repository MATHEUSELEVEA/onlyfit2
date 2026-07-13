import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FEED_SPORTS } from '@/lib/sports';
import { useTranslation } from '@/i18n/I18nProvider';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';

const MAX_GROUPS = 3;

// Configuração obrigatória do Profissional: em quais grupos de afinidade ele
// atua (máx. 3). Alimenta descoberta e recomendação. Só é montado quando o
// usuário é Profissional. Escreve via RPC `set_affinity_groups` — o cliente
// nunca grava direto em creator_profiles (regra 7 + RLS é a fonte da verdade).
// A seleção vem do cache de `useMyProfile`; a mutação atualiza o cache de forma
// otimista, então não há estado local a sincronizar.
export function AffinityGroupsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const [limitHit, setLimitHit] = useState(false);

  const selected = profile?.affinitySports ?? [];
  const queryKey = myProfileQueryKey(profile?.userId);

  const mutation = useMutation({
    mutationFn: async (sports: string[]) => {
      const { data, error } = await supabase.rpc('set_affinity_groups', { p_sports: sports });
      if (error) throw error;
      return data as { sports: string[] };
    },
    onMutate: async (sports: string[]) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MyProfile | null>(queryKey);
      queryClient.setQueryData<MyProfile | null>(queryKey, (current) =>
        current ? { ...current, affinitySports: sports } : current,
      );
      return { previous };
    },
    onError: (_error, _sports, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (data) => {
      const sports = data.sports ?? [];
      queryClient.setQueryData<MyProfile | null>(queryKey, (current) =>
        current ? { ...current, affinitySports: sports } : current,
      );
    },
  });

  function toggle(key: string) {
    setLimitHit(false);
    const isOn = selected.includes(key);
    if (!isOn && selected.length >= MAX_GROUPS) {
      setLimitHit(true);
      return;
    }
    const next = isOn ? selected.filter((s) => s !== key) : [...selected, key];
    mutation.mutate(next);
  }

  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-body font-medium text-on-surface">
          {t('profile.affinity.title')}
        </p>
        {mutation.isPending ? (
          <Loader2 size={16} className="animate-spin text-on-surface-variant" aria-hidden />
        ) : (
          <span className="font-sans text-counter text-on-surface-variant">
            {selected.length}/{MAX_GROUPS}
          </span>
        )}
      </div>
      <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
        {t('profile.affinity.description')}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FEED_SPORTS.map((sport) => {
          const active = selected.includes(sport.key);
          return (
            <button
              key={sport.key}
              type="button"
              onClick={() => toggle(sport.key)}
              aria-pressed={active}
              className={
                'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-sans text-label transition-colors ' +
                (active
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'border border-outline-variant/50 bg-surface text-on-surface-variant')
              }
            >
              {active && <Check size={15} strokeWidth={3} aria-hidden />}
              {sport.label}
            </button>
          );
        })}
      </div>

      {limitHit && (
        <p role="alert" className="mt-3 font-sans text-body-sm text-error">
          {t('profile.affinity.limit')}
        </p>
      )}
    </div>
  );
}
