import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Check,
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

  const [activationOpen, setActivationOpen] = useState(false);
  const [draftGroups, setDraftGroups] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState(false);

  const isProfessional = profile?.isProfessional ?? false;
  const selectedGroups = profile?.affinitySports ?? [];
  const busy = false;

  // draftGroups só é lido enquanto o painel está aberto, e openActivation()
  // semeia o valor a partir de selectedGroups antes de abrir — por isso não
  // é preciso um efeito de sincronização enquanto o painel está fechado.

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

  const setProfessionalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_professional_tools_enabled', {
        p_enabled: enabled,
      });
      if (error) throw error;
      return data as { professional_shell_enabled: boolean; is_creator: boolean };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              isProfessional: Boolean(data.professional_shell_enabled),
              isCreator: Boolean(data.is_creator),
            }
          : current,
      );
    },
  });

  const isSaving =
    setAffinityGroupsMutation.isPending ||
    setProfessionalMutation.isPending ||
    busy;

  function openActivation() {
    setFeedback(null);
    setCreateNotice(false);
    setDraftGroups(selectedGroups);
    setActivationOpen(true);
  }

  function toggleDraftGroup(key: string) {
    setFeedback(null);
    setDraftGroups((current) => {
      const active = current.includes(key);
      if (active && current.length <= 1) {
        setFeedback(t('profile.business.affinityRequired'));
        return current;
      }
      if (!active && current.length >= MAX_GROUPS) {
        setFeedback(t('profile.affinity.limit'));
        return current;
      }
      return active ? current.filter((item) => item !== key) : [...current, key];
    });
  }

  async function saveActivation() {
    setFeedback(null);
    if (draftGroups.length === 0) {
      setFeedback(t('profile.business.affinityRequired'));
      return;
    }

    try {
      await setAffinityGroupsMutation.mutateAsync(draftGroups);
      await setProfessionalMutation.mutateAsync(true);
      setActivationOpen(false);
    } catch {
      setFeedback(t('profile.business.activationError'));
    }
  }

  function toggleProfessionalGroup(key: string) {
    setFeedback(null);
    const active = selectedGroups.includes(key);
    if (active && selectedGroups.length <= 1) {
      setFeedback(t('profile.business.affinityRequired'));
      return;
    }
    if (!active && selectedGroups.length >= MAX_GROUPS) {
      setFeedback(t('profile.affinity.limit'));
      return;
    }
    const next = active ? selectedGroups.filter((item) => item !== key) : [...selectedGroups, key];
    setAffinityGroupsMutation.mutate(next, {
      onError: () => setFeedback(t('profile.business.affinitySaveError')),
    });
  }

  function toggleProfessional() {
    setCreateNotice(false);
    if (isSaving) return;
    if (activationOpen && !isProfessional) {
      setActivationOpen(false);
      setFeedback(null);
      return;
    }
    if (isProfessional) {
      setActivationOpen(false);
      setFeedback(null);
      setProfessionalMutation.mutate(false, {
        onError: () => setFeedback(t('profile.business.activationError')),
      });
      return;
    }
    openActivation();
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
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        <header className="sticky top-0 z-10 border-b border-outline-variant/30 bg-surface-container-lowest/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/perfil"
              aria-label={t('profile.business.back')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors active:bg-surface-container-high"
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

          <div className="mt-4 grid grid-cols-2 gap-2">
            <SummaryTile
              label={t('profile.business.ownedShort')}
              value={String(ownedBusinesses.length)}
              icon={BriefcaseBusiness}
            />
            <SummaryTile
              label={t('profile.business.invitedShort')}
              value={String(invitedBusinesses.length)}
              icon={UsersRound}
            />
          </div>
        </header>

        <main className="space-y-5 px-4 py-5">
          <BusinessSection
            icon={BriefcaseBusiness}
            title={t('profile.business.ownedTitle')}
            count={ownedBusinesses.length}
            description={t('profile.business.ownedDescription')}
          >
            <ProfessionalToggle
              checked={isProfessional || activationOpen}
              disabled={isSaving}
              onToggle={toggleProfessional}
              title={t('profile.becomeProfessional.title')}
              description={t('profile.business.professionalToggleDescription')}
            />

            {(activationOpen || isProfessional) && (
              <div className="border-t border-outline-variant/25 px-4 py-4">
                <AffinitySelector
                  selected={activationOpen ? draftGroups : selectedGroups}
                  disabled={isSaving}
                  onToggle={activationOpen ? toggleDraftGroup : toggleProfessionalGroup}
                  title={t('profile.affinity.title')}
                  description={t('profile.business.affinityDescription')}
                  pending={setAffinityGroupsMutation.isPending}
                />

                {activationOpen && (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActivationOpen(false);
                        setFeedback(null);
                      }}
                      disabled={isSaving}
                      className="min-h-11 flex-1 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface transition-colors active:bg-surface-container-low disabled:opacity-60"
                    >
                      {t('profile.business.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={saveActivation}
                      disabled={isSaving || draftGroups.length === 0}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
                    >
                      {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden />}
                      {t('profile.business.saveProfessional')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <p role="alert" className="border-t border-outline-variant/25 px-4 py-3 font-sans text-body-sm text-error">
                {feedback}
              </p>
            )}

            {isProfessional && (
              <div className="border-t border-outline-variant/25 px-4 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setCreateNotice(true);
                    setFeedback(null);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98]"
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

            <div className="border-t border-outline-variant/25">
              {isLoadingOwned ? (
                <LoadingBlock />
              ) : ownedBusinesses.length > 0 ? (
                <div className="divide-y divide-outline-variant/25">
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
          </BusinessSection>

          <BusinessSection
            icon={UsersRound}
            title={t('profile.business.invitedTitle')}
            count={invitedBusinesses.length}
            description={t('profile.business.invitedDescription')}
          >
            <div className="border-t border-outline-variant/25">
              {invitedBusinesses.length > 0 ? (
                <div className="divide-y divide-outline-variant/25">
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
          </BusinessSection>
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

function BusinessSection({
  icon: Icon,
  title,
  count,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
      <div className="flex items-start gap-3 px-4 py-4">
        <IconChip icon={Icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-sans text-body font-semibold text-on-surface">{title}</h2>
            <span className="rounded-full bg-surface-container-low px-2 py-0.5 font-sans text-counter text-on-surface-variant">
              {count}
            </span>
          </div>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfessionalToggle({
  checked,
  disabled,
  title,
  description,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[78px] items-center gap-4 border-t border-outline-variant/25 px-4 py-4">
      <IconChip icon={ShieldCheck} />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-body font-medium text-on-surface">{title}</p>
        <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={onToggle}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-surface-container-highest',
        )}
      >
        <span
          className={clsx(
            'absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest shadow-sm transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

function AffinitySelector({
  selected,
  disabled,
  pending,
  title,
  description,
  onToggle,
}: {
  selected: string[];
  disabled: boolean;
  pending: boolean;
  title: string;
  description: string;
  onToggle: (key: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-body font-medium text-on-surface">{title}</p>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{description}</p>
        </div>
        {pending ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-on-surface-variant" aria-hidden />
        ) : (
          <span className="shrink-0 font-sans text-counter text-on-surface-variant">
            {selected.length}/{MAX_GROUPS}
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
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
                'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-sans text-label transition-colors disabled:opacity-60',
                active
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'border border-outline-variant/50 bg-surface text-on-surface-variant',
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
    <article className="flex gap-3 px-4 py-4">
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
    <article className="flex gap-3 px-4 py-4">
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

function SummaryTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3 rounded-2xl bg-surface px-3 py-3 ring-1 ring-outline-variant/30">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-title-lg leading-none text-on-surface">{value}</span>
        <span className="mt-1 block truncate font-sans text-counter text-on-surface-variant">{label}</span>
      </span>
    </div>
  );
}

function EmptyBlock({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex min-h-[148px] flex-col items-center justify-center px-6 py-8 text-center">
      <IconChip icon={Icon} />
      <h3 className="mt-3 font-sans text-body font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 max-w-[34ch] font-sans text-body-sm text-on-surface-variant">{description}</p>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[148px] items-center justify-center px-6 py-8">
      <Loader2 size={22} className="animate-spin text-primary" aria-label="Carregando" />
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
