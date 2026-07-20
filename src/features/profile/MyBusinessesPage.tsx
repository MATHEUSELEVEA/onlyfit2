import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  ShieldCheck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { intlLocaleFromLanguage } from '@/i18n/language';
import { supabase } from '@/lib/supabase';
import { useAffinityGroups } from '@/lib/sports';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';

const MAX_GROUPS = 3;

interface BusinessRow {
  id: string;
  name: string;
  kind: string | null;
  subtype: string | null;
  business_type: string | null;
  status: string | null;
  logo_url: string | null;
  created_at: string | null;
  sports: string[] | null;
  verified: boolean;
}

interface BusinessConnection {
  organization_id: string;
  organization_name: string;
  logo_url: string | null;
  business_type: string | null;
  verified: boolean;
  role: 'owner' | 'staff';
  membership_status: 'pending' | 'active';
  owner_name: string;
  owner_username: string | null;
  inviter_name: string;
  inviter_username: string | null;
  invited_at: string | null;
}

type BusinessTab = 'owned' | 'invited';

const businessKindLabelKey: Record<string, TranslationKey> = {
  professional_consultancy: 'profile.business.kind.professionalConsultancy',
  sports_consultancy: 'profile.business.kind.sportsConsultancy',
  content_creator: 'profile.business.kind.contentCreator',
  brand: 'profile.business.kind.brand',
  facility: 'profile.business.kind.facility',
  business: 'profile.business.kind.business',
};

const businessStatusLabelKey: Record<string, TranslationKey> = {
  draft: 'profile.business.status.draft',
  published: 'profile.business.status.published',
  suspended: 'profile.business.status.suspended',
};

export function MyBusinessesPage() {
  const { groups, labelFor } = useAffinityGroups();
  const { session } = useAuth();
  const { language, t } = useTranslation();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const profileQueryKey = myProfileQueryKey(userId);
  const { data: profile } = useMyProfile();
  const { data: ownedBusinesses = [], isLoading: isLoadingOwned, isError: ownedError } = useOwnedBusinesses(userId);
  const {
    data: connections = [],
    isLoading: isLoadingConnections,
    isError: connectionsError,
  } = useBusinessConnections(userId);

  const [activeTab, setActiveTab] = useState<BusinessTab>('owned');
  const [feedback, setFeedback] = useState<string | null>(null);

  const isProfessional = profile?.isProfessional ?? false;
  const selectedGroups = profile?.affinitySports ?? [];
  const pendingInvites = connections.filter((item) => item.membership_status === 'pending');
  const managedBusinesses = connections.filter((item) => item.membership_status === 'active');

  const setAffinityGroupsMutation = useMutation({
    mutationFn: async (sports: string[]) => {
      const { data, error } = await supabase.rpc('set_affinity_groups', { p_sports: sports });
      if (error) throw error;
      return data as { sports: string[] };
    },
    onMutate: async (sports) => {
      await queryClient.cancelQueries({ queryKey: profileQueryKey });
      const previous = queryClient.getQueryData<MyProfile | null>(profileQueryKey);
      queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
        current ? { ...current, affinitySports: sports } : current,
      );
      return { previous };
    },
    onError: (_error, _sports, context) => {
      if (context) queryClient.setQueryData(profileQueryKey, context.previous);
      setFeedback(t('profile.business.affinitySaveError'));
    },
    onSuccess: (data, sports) => {
      queryClient.setQueryData<MyProfile | null>(profileQueryKey, (current) =>
        current ? { ...current, affinitySports: data.sports ?? sports } : current,
      );
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ organizationId, accept }: { organizationId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_organization_invite', {
        p_organization_id: organizationId,
        p_accept: accept,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-business-connections'] }),
  });

  function toggleProfessionalGroup(key: string) {
    setFeedback(null);
    const active = selectedGroups.includes(key);
    if (!active && selectedGroups.length >= MAX_GROUPS) {
      setFeedback(t('profile.affinity.limit'));
      return;
    }
    const next = active ? selectedGroups.filter((item) => item !== key) : [...selectedGroups, key];
    setAffinityGroupsMutation.mutate(next);
  }

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocaleFromLanguage(language), {
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
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <h1 className="min-w-0 truncate font-sans text-title-lg text-on-surface">
              {t('profile.business.title')}
            </h1>
          </div>
        </header>

        <main className="px-4 pb-8 pt-2">
          <div
            role="tablist"
            aria-label={t('profile.business.tabsLabel')}
            className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container-low p-1"
          >
            <TabButton
              id="owned-tab"
              active={activeTab === 'owned'}
              label={t('profile.business.ownedShort')}
              count={ownedBusinesses.length}
              onClick={() => setActiveTab('owned')}
            />
            <TabButton
              id="invited-tab"
              active={activeTab === 'invited'}
              label={t('profile.business.invitedShort')}
              count={connections.length}
              alertCount={pendingInvites.length}
              onClick={() => setActiveTab('invited')}
            />
          </div>

          {activeTab === 'owned' ? (
            <section role="tabpanel" aria-labelledby="owned-tab">
              {isProfessional && (
                <Group
                  className="mt-6"
                  title={t('profile.affinity.title')}
                  hint={t('profile.business.affinityHint')}
                  trailing={
                    setAffinityGroupsMutation.isPending ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-primary"
                        aria-label={t('profile.business.saving')}
                      />
                    ) : (
                      <Counter value={`${selectedGroups.length}/${MAX_GROUPS}`} />
                    )
                  }
                >
                  <div className="flex flex-wrap gap-2 p-3">
                    {groups.map((sport) => {
                      const active = selectedGroups.includes(sport.key);
                      return (
                        <button
                          key={sport.key}
                          type="button"
                          onClick={() => toggleProfessionalGroup(sport.key)}
                          disabled={setAffinityGroupsMutation.isPending}
                          aria-pressed={active}
                          className={clsx(
                            'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
                            active
                              ? 'bg-primary text-on-primary'
                              : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                          )}
                        >
                          {active && <Check size={15} strokeWidth={3} aria-hidden />}
                          {sport.label}
                        </button>
                      );
                    })}
                  </div>
                </Group>
              )}

              <Group className="mt-8" title={t('profile.business.ownedTitle')}>
                {isLoadingOwned ? (
                  <LoadingRows />
                ) : ownedError ? (
                  <ErrorRow message={t('profile.business.loadError')} />
                ) : (
                  <>
                    {ownedBusinesses.map((business) => (
                      <BusinessLinkRow
                        key={business.id}
                        to={`/negocios/${business.id}`}
                        name={business.name}
                        logoUrl={business.logo_url}
                        verified={business.verified}
                        meta={businessMeta(business, dateFormatter, labelFor, t)}
                        badge={
                          business.status
                            ? t(businessStatusLabelKey[business.status] ?? 'profile.business.status.draft')
                            : null
                        }
                        verifiedLabel={t('profile.business.verified')}
                      />
                    ))}

                    {ownedBusinesses.length === 0 && (
                      <MessageRow
                        icon={isProfessional ? BriefcaseBusiness : ShieldCheck}
                        title={
                          isProfessional
                            ? t('profile.business.emptyOwnedTitle')
                            : t('profile.business.activateTitle')
                        }
                        description={
                          isProfessional
                            ? t('profile.business.emptyOwnedDescription')
                            : t('profile.business.activateDescription')
                        }
                      />
                    )}

                    {isProfessional ? (
                      <ActionRow
                        to="/negocios/novo"
                        icon={Plus}
                        label={t('profile.business.createBusiness')}
                      />
                    ) : (
                      <ActionRow
                        to="/perfil"
                        icon={ShieldCheck}
                        label={t('profile.business.activateAction')}
                      />
                    )}
                  </>
                )}
              </Group>

              {feedback && (
                <p role="alert" className="mt-3 font-sans text-body-sm text-error">
                  {feedback}
                </p>
              )}
            </section>
          ) : (
            <section role="tabpanel" aria-labelledby="invited-tab">
              {isLoadingConnections ? (
                <Group className="mt-6" title={t('profile.business.managedTitle')}>
                  <LoadingRows />
                </Group>
              ) : connectionsError ? (
                <Group className="mt-6" title={t('profile.business.managedTitle')}>
                  <ErrorRow message={t('profile.business.loadError')} />
                </Group>
              ) : connections.length === 0 ? (
                <Group className="mt-6" title={t('profile.business.managedTitle')}>
                  <MessageRow
                    icon={UsersRound}
                    title={t('profile.business.emptyInvitedTitle')}
                    description={t('profile.business.emptyInvitedDescription')}
                  />
                </Group>
              ) : (
                <>
                  {pendingInvites.length > 0 && (
                    <section className="mt-6" aria-labelledby="pending-invites-title">
                      <GroupHeader id="pending-invites-title" title={t('profile.business.invite.pendingTitle')} />
                      <div className="mt-2 space-y-3">
                        {pendingInvites.map((connection) => (
                          <InviteCard
                            key={connection.organization_id}
                            connection={connection}
                            isResponding={
                              respondMutation.isPending &&
                              respondMutation.variables?.organizationId === connection.organization_id
                            }
                            onRespond={(accept) =>
                              respondMutation.mutate({ organizationId: connection.organization_id, accept })
                            }
                          />
                        ))}
                      </div>
                      {respondMutation.isError && (
                        <p role="alert" className="mt-3 font-sans text-body-sm text-error">
                          {t('profile.business.invite.respondError')}
                        </p>
                      )}
                    </section>
                  )}

                  {managedBusinesses.length > 0 && (
                    <Group
                      className={pendingInvites.length > 0 ? 'mt-8' : 'mt-6'}
                      title={t('profile.business.managedTitle')}
                    >
                      {managedBusinesses.map((connection) => (
                        <BusinessLinkRow
                          key={connection.organization_id}
                          to={`/negocios/${connection.organization_id}`}
                          name={connection.organization_name}
                          logoUrl={connection.logo_url}
                          verified={connection.verified}
                          meta={`${t('profile.business.invite.ownerLabel')} ${connection.owner_name}${connection.owner_username ? ` (@${connection.owner_username})` : ''}`}
                          badge={
                            connection.role === 'owner'
                              ? t('profile.business.role.owner')
                              : t('profile.business.role.collaborator')
                          }
                          verifiedLabel={t('profile.business.verified')}
                        />
                      ))}
                    </Group>
                  )}
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function businessMeta(
  business: BusinessRow,
  dateFormatter: Intl.DateTimeFormat,
  labelFor: (key: string) => string,
  t: (key: TranslationKey) => string,
) {
  const createdAt = business.created_at ? dateFormatter.format(new Date(business.created_at)) : null;
  const sports = (business.sports ?? []).map(labelFor).join(', ');
  const kind =
    business.business_type === 'independent'
      ? t('profile.business.kind.independent')
      : business.business_type === 'company'
        ? t('profile.business.kind.company')
        : business.kind
          ? t(businessKindLabelKey[business.kind] ?? 'profile.business.kind.business')
          : t('profile.business.kind.business');
  return [kind, sports, createdAt].filter(Boolean).join(' · ');
}

function useOwnedBusinesses(userId: string | undefined) {
  return useQuery({
    queryKey: ['mobile-owned-businesses', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<BusinessRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('organizations')
        .select('id,name,kind,subtype,business_type,status,logo_url,created_at,sports,verified')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as BusinessRow[];
    },
  });
}

function useBusinessConnections(userId: string | undefined) {
  return useQuery({
    queryKey: ['mobile-business-connections', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<BusinessConnection[]> => {
      const { data, error } = await supabase.rpc('list_my_organization_connections');
      if (error) throw error;
      return (data ?? []) as BusinessConnection[];
    },
  });
}

// Cabeçalho discreto + caixa de conteúdo: o rótulo nomeia o grupo, as linhas
// dentro da caixa são o que o usuário toca. Mantém o título da seção abaixo do
// nome do negócio na hierarquia, como em listas agrupadas nativas.
function Group({
  className,
  title,
  hint,
  trailing,
  children,
}: {
  className?: string;
  title: string;
  hint?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const titleId = `group-${title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <section className={className} aria-labelledby={titleId}>
      <GroupHeader id={titleId} title={title} hint={hint} trailing={trailing} />
      <div className="mt-2 divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
        {children}
      </div>
    </section>
  );
}

function GroupHeader({
  id,
  title,
  hint,
  trailing,
}: {
  id: string;
  title: string;
  hint?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 id={id} className="font-sans text-label text-on-surface">
          {title}
        </h2>
        {hint && <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{hint}</p>}
      </div>
      {trailing && <div className="flex h-5 shrink-0 items-center">{trailing}</div>}
    </div>
  );
}

function Counter({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-surface-container px-2 py-0.5 font-sans text-counter text-on-surface-variant">
      {value}
    </span>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-surface-container-highest px-2.5 py-1 font-sans text-counter text-on-surface-variant">
      {label}
    </span>
  );
}

function TabButton({
  id,
  active,
  label,
  count,
  alertCount = 0,
  onClick,
}: {
  id: string;
  active: boolean;
  label: string;
  count: number;
  alertCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'relative inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'bg-surface-container-high text-on-surface'
          : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
      )}
    >
      {label}
      {count > 0 && (
        <span className={clsx('font-sans text-counter', active ? 'text-on-surface' : 'text-on-surface-variant')}>
          {count}
        </span>
      )}
      {alertCount > 0 && (
        <span className="absolute right-2 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-sans text-nav font-bold text-on-primary">
          {alertCount > 9 ? '9+' : alertCount}
        </span>
      )}
    </button>
  );
}

// O negócio inteiro é o alvo de toque — sem botão solto ao lado do card, que era
// o que fazia negócio e ação parecerem coisas separadas na tela.
function BusinessLinkRow({
  to,
  name,
  logoUrl,
  verified,
  meta,
  badge,
  verifiedLabel,
}: {
  to: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  meta: string;
  badge: string | null;
  verifiedLabel: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
    >
      <BusinessLogo name={name} logoUrl={logoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate font-sans text-title text-on-surface">{name}</h3>
          {verified && <ShieldCheck size={16} className="shrink-0 text-primary" aria-label={verifiedLabel} />}
        </div>
        <p className="mt-0.5 truncate font-sans text-body-sm text-on-surface-variant">{meta}</p>
        {badge && (
          <div className="mt-2">
            <Badge label={badge} />
          </div>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
    </Link>
  );
}

function ActionRow({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate font-sans text-body font-semibold text-primary">{label}</span>
      <ChevronRight size={18} className="shrink-0 text-primary" aria-hidden />
    </Link>
  );
}

// Convite pendente é o único item da tela com duas ações próprias, então
// permanece um card fechado: identidade, quem convidou e a decisão, juntos.
function InviteCard({
  connection,
  isResponding,
  onRespond,
}: {
  connection: BusinessConnection;
  isResponding: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const { t } = useTranslation();
  const role =
    connection.role === 'owner' ? t('profile.business.role.owner') : t('profile.business.role.collaborator');

  return (
    <article className="rounded-2xl bg-surface-container p-4">
      <div className="flex items-center gap-3">
        <BusinessLogo name={connection.organization_name} logoUrl={connection.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate font-sans text-title text-on-surface">{connection.organization_name}</h3>
            {connection.verified && (
              <ShieldCheck size={16} className="shrink-0 text-primary" aria-label={t('profile.business.verified')} />
            )}
          </div>
          <p className="mt-0.5 truncate font-sans text-body-sm text-on-surface-variant">
            {`${t('profile.business.invite.invitedBy')} ${connection.inviter_name}${connection.inviter_username ? ` (@${connection.inviter_username})` : ''}`}
          </p>
          <div className="mt-2">
            <Badge label={`${t('profile.business.invite.asRole')} ${role}`} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={isResponding}
          onClick={() => onRespond(false)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-surface-container-high px-5 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          <X size={16} aria-hidden />
          {t('profile.business.invite.reject')}
        </button>
        <button
          type="button"
          disabled={isResponding}
          onClick={() => onRespond(true)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {isResponding ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
          {t('profile.business.invite.accept')}
        </button>
      </div>
    </article>
  );
}

function BusinessLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
  ) : (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant"
      aria-label={name}
    >
      <Building2 size={20} aria-hidden />
    </span>
  );
}

function MessageRow({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
        <Icon size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-body font-semibold text-on-surface">{title}</h3>
        <p className="mt-1 max-w-[46ch] font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}

function LoadingRows() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-4 py-4" aria-label={t('profile.business.loading')}>
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/5 animate-pulse rounded bg-surface-container-highest" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container-high" />
      </div>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <p className="px-4 py-4 font-sans text-body text-error" role="alert">
      {message}
    </p>
  );
}
