import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { supabase } from '@/lib/supabase';
import { FEED_SPORTS, sportLabel } from '@/lib/sports';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';

const MAX_GROUPS = 3;

interface BusinessRow {
  id: string;
  name: string;
  kind: string | null;
  subtype: string | null;
  status: string | null;
  city: string | null;
  state: string | null;
  logo_url: string | null;
  created_at: string | null;
  sports: string[] | null;
}

interface InvitedBusinessRow {
  id: string;
  name: string;
  role: string;
  ownerName: string;
  status: string;
}

const businessKindLabel: Record<string, string> = {
  professional_consultancy: 'Consultoria',
  sports_consultancy: 'Assessoria',
  content_creator: 'Criador',
  brand: 'Loja/Marca',
  facility: 'Local',
};

const businessStatusLabel: Record<string, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  suspended: 'Suspenso',
};

export function MyBusinessesPage() {
  const { session } = useAuth();
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const profileQueryKey = myProfileQueryKey(userId);
  const { data: profile } = useMyProfile();
  const { data: ownedBusinesses = [], isLoading: isLoadingOwned } = useOwnedBusinesses(userId);
  const invitedBusinesses = useMemo<InvitedBusinessRow[]>(() => [], []);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState(false);

  const isProfessional = profile?.isProfessional ?? false;
  const selectedGroups = profile?.affinitySports ?? [];

  const setAffinityGroupsMutation = useMutation({
    mutationFn: async (sports: string[]) => {
      const { data, error } = await supabase.rpc('set_affinity_groups', { p_sports: sports });
      if (error) throw error;
      return data as { sports: string[] };
    },
    onSuccess: (data, sports) => {
      queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
        current ? { ...current, affinitySports: data.sports ?? sports } : current,
      );
    },
  });

  const isSaving = setAffinityGroupsMutation.isPending;

  function toggleProfessionalGroup(key: string) {
    setFeedback(null);
    const active = selectedGroups.includes(key);
    if (!active && selectedGroups.length >= MAX_GROUPS) {
      setFeedback(t('profile.affinity.limit'));
      return;
    }
    const next = active ? selectedGroups.filter((item) => item !== key) : [...selectedGroups, key];
    setAffinityGroupsMutation.mutate(next, {
      onError: () => setFeedback(t('profile.business.affinitySaveError')),
    });
  }

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'pt' ? 'pt-BR' : 'en-US', {
        month: 'short',
        year: 'numeric',
      }),
    [language],
  );

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[640px] bg-background">
        <header className="sticky top-0 z-10 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil"
              aria-label={t('profile.business.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">
                {t('profile.business.title')}
              </h1>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.pageDescription')}
              </p>
            </div>
          </div>
        </header>

        <main className="px-4 pb-8 pt-4">
          <section aria-labelledby="owned-businesses-title">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 id="owned-businesses-title" className="font-sans text-title text-on-surface">
                    {t('profile.business.ownedTitle')}
                  </h2>
                  {ownedBusinesses.length > 0 && (
                    <span className="font-sans text-counter text-on-surface-variant">
                      {ownedBusinesses.length}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                  {t('profile.business.ownedDescription')}
                </p>
              </div>
            </div>

            {isProfessional && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateNotice(true);
                    setFeedback(null);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/80"
                >
                  <Plus size={18} aria-hidden />
                  {t('profile.business.createBusiness')}
                </button>
                {createNotice && (
                  <p role="status" className="mt-3 font-sans text-body-sm text-on-surface-variant">
                    {t('profile.business.createNotice')}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5">
              {isLoadingOwned ? (
                <LoadingBlock />
              ) : ownedBusinesses.length > 0 ? (
                <div className="divide-y divide-outline-variant/25 rounded-2xl bg-surface">
                  {ownedBusinesses.map((business) => (
                    <BusinessListItem
                      key={business.id}
                      business={business}
                      dateFormatter={dateFormatter}
                    />
                  ))}
                </div>
              ) : (
                <EmptyBlock
                  icon={isProfessional ? BriefcaseBusiness : ShieldCheck}
                  title={isProfessional ? t('profile.business.emptyOwnedTitle') : t('profile.business.activateTitle')}
                  description={
                    isProfessional
                      ? t('profile.business.emptyOwnedDescription')
                      : t('profile.business.activateDescription')
                  }
                />
              )}
            </div>
          </section>

          <section aria-labelledby="invited-businesses-title" className="mt-8 border-t border-outline-variant/25 pt-6">
            <div className="flex items-center gap-2">
              <h2 id="invited-businesses-title" className="font-sans text-title text-on-surface">
                {t('profile.business.invitedTitle')}
              </h2>
              {invitedBusinesses.length > 0 && (
                <span className="font-sans text-counter text-on-surface-variant">
                  {invitedBusinesses.length}
                </span>
              )}
            </div>
            <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
              {t('profile.business.invitedDescription')}
            </p>

            <div className="mt-4">
              {invitedBusinesses.length > 0 ? (
                <div className="divide-y divide-outline-variant/25 rounded-2xl bg-surface">
                  {invitedBusinesses.map((business) => (
                    <InvitedBusinessListItem key={business.id} business={business} />
                  ))}
                </div>
              ) : (
                <EmptyBlock
                  icon={UsersRound}
                  title={t('profile.business.emptyInvitedTitle')}
                  description={t('profile.business.emptyInvitedDescription')}
                />
              )}
            </div>
          </section>

          {isProfessional && (
            <details className="group mt-8 border-t border-outline-variant/25 pt-2">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-2 text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 [&::-webkit-details-marker]:hidden">
                <BriefcaseBusiness size={19} className="shrink-0 text-on-surface-variant" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body font-medium">{t('profile.affinity.title')}</span>
                  <span className="block font-sans text-body-sm text-on-surface-variant">
                    {selectedGroups.length}/{MAX_GROUPS}
                  </span>
                </span>
                <ChevronDown
                  size={18}
                  className="shrink-0 text-on-surface-variant transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="px-2 pb-2 pt-3">
                <AffinitySelector
                  selected={selectedGroups}
                  disabled={isSaving}
                  onToggle={toggleProfessionalGroup}
                  description={t('profile.business.affinityDescription')}
                  pending={setAffinityGroupsMutation.isPending}
                />
                {feedback && (
                  <p role="alert" className="mt-3 font-sans text-body-sm text-error">
                    {feedback}
                  </p>
                )}
              </div>
            </details>
          )}
        </main>
      </div>
    </div>
  );
}

function useOwnedBusinesses(userId: string | undefined) {
  return useQuery({
    queryKey: ['mobile-owned-businesses', userId] as const,
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async (): Promise<BusinessRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('organizations')
        .select('id,name,kind,subtype,status,city,state,logo_url,created_at,sports')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BusinessRow[];
    },
  });
}

function AffinitySelector({
  selected,
  disabled,
  pending,
  description,
  onToggle,
}: {
  selected: string[];
  disabled: boolean;
  pending: boolean;
  description: string;
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-body-sm text-on-surface-variant">{description}</p>
        {pending ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-on-surface-variant" aria-hidden />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {FEED_SPORTS.map((sport) => {
          const active = selected.includes(sport.key);
          return (
            <button
              key={sport.key}
              type="button"
              onClick={() => onToggle(sport.key)}
              disabled={disabled}
              aria-pressed={active}
              className={clsx(
                'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-60',
                active
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container',
              )}
            >
              {active && <Check size={15} strokeWidth={3} aria-hidden />}
              {sport.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BusinessListItem({
  business,
  dateFormatter,
}: {
  business: BusinessRow;
  dateFormatter: Intl.DateTimeFormat;
}) {
  const location = [business.city, business.state].filter(Boolean).join(', ');
  const createdAt = business.created_at ? dateFormatter.format(new Date(business.created_at)) : null;
  const sports = (business.sports ?? []).map(sportLabel).join(', ');
  const kind = business.kind ? businessKindLabel[business.kind] ?? business.kind : 'Negócio';
  const status = business.status ? businessStatusLabel[business.status] ?? business.status : null;

  return (
    <article className="flex gap-3 px-3 py-4">
      {business.logo_url ? (
        <img
          src={business.logo_url}
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <IconChip icon={Building2} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-sans text-body font-semibold text-on-surface">
            {business.name}
          </h3>
          {status && (
            <span className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 font-sans text-counter text-on-surface-variant">
              {status}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 font-sans text-body-sm text-on-surface-variant">
          {[kind, sports, location, createdAt].filter(Boolean).join(' · ')}
        </p>
      </div>
    </article>
  );
}

function InvitedBusinessListItem({ business }: { business: InvitedBusinessRow }) {
  return (
    <article className="flex gap-3 px-3 py-4">
      <IconChip icon={UsersRound} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-sans text-body font-semibold text-on-surface">
          {business.name}
        </h3>
        <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
          {business.role} · {business.ownerName} · {business.status}
        </p>
      </div>
    </article>
  );
}

function EmptyBlock({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container-low px-4 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
        <Icon size={17} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-body font-medium text-on-surface">{title}</h3>
        <p className="mt-0.5 max-w-[46ch] font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="space-y-3 rounded-2xl bg-surface px-3 py-4" aria-label="Carregando">
      <div className="h-4 w-2/5 animate-pulse rounded bg-surface-container-high" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
    </div>
  );
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}
