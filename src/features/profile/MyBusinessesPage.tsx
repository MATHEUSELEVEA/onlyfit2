import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  Loader2,
  Plus,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { supabase } from '@/lib/supabase';
import { FEED_SPORTS, sportLabel } from '@/lib/sports';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SelectField, TextField } from '@/components/ui/TextField';
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

const businessKindLabel: Record<string, string> = {
  professional_consultancy: 'Consultoria',
  sports_consultancy: 'Assessoria',
  content_creator: 'Criador',
  brand: 'Loja/Marca',
  facility: 'Local',
  business: 'Negócio',
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
  const { data: ownedBusinesses = [], isLoading: isLoadingOwned, isError: ownedError } = useOwnedBusinesses(userId);
  const {
    data: connections = [],
    isLoading: isLoadingConnections,
    isError: connectionsError,
  } = useBusinessConnections(userId);

  const [activeTab, setActiveTab] = useState<BusinessTab>('owned');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inviteBusiness, setInviteBusiness] = useState<BusinessRow | null>(null);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<'staff' | 'owner'>('staff');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const isProfessional = profile?.isProfessional ?? false;
  const selectedGroups = profile?.affinitySports ?? [];
  const pendingCount = connections.filter((item) => item.membership_status === 'pending').length;

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

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!inviteBusiness) return;
      const { error } = await supabase.rpc('invite_organization_member', {
        p_organization_id: inviteBusiness.id,
        p_username: inviteUsername.trim(),
        p_role: inviteRole,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setInviteError(null);
      setInviteSuccess(t('profile.business.invite.success'));
      setInviteUsername('');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '';
      setInviteSuccess(null);
      setInviteError(
        message.includes('username_not_found')
          ? t('profile.business.invite.userNotFound')
          : message.includes('already_a_member')
            ? t('profile.business.invite.alreadyMember')
            : message.includes('cannot_invite_yourself')
              ? t('profile.business.invite.yourself')
              : t('profile.business.invite.error'),
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

  function openInvite(business: BusinessRow) {
    setInviteBusiness(business);
    setInviteUsername('');
    setInviteRole('staff');
    setInviteError(null);
    setInviteSuccess(null);
  }

  function closeInvite() {
    if (inviteMutation.isPending) return;
    setInviteBusiness(null);
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (inviteUsername.trim().replace(/^@/, '').length < 2) {
      setInviteError(t('profile.business.invite.usernameRequired'));
      return;
    }
    inviteMutation.mutate();
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
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate font-sans text-title-lg text-on-surface">{t('profile.business.title')}</h1>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.pageDescription')}
              </p>
            </div>
          </div>
        </header>

        <main className="px-4 pb-8 pt-3">
          <div
            role="tablist"
            aria-label={t('profile.business.tabsLabel')}
            className="grid grid-cols-2 rounded-xl bg-surface-container-low p-1"
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
              alertCount={pendingCount}
              onClick={() => setActiveTab('invited')}
            />
          </div>

          {activeTab === 'owned' ? (
            <section role="tabpanel" aria-labelledby="owned-tab" className="pt-6">
              {isProfessional && (
                <section aria-labelledby="affinity-title">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 id="affinity-title" className="font-sans text-title text-on-surface">
                        {t('profile.affinity.title')}
                      </h2>
                      <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                        {t('profile.business.affinityDescription')}
                      </p>
                    </div>
                    {setAffinityGroupsMutation.isPending ? (
                      <Loader2 size={17} className="mt-1 shrink-0 animate-spin text-primary" aria-label={t('profile.business.saving')} />
                    ) : (
                      <span className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 font-sans text-counter text-on-surface-variant">
                        {selectedGroups.length}/{MAX_GROUPS}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {FEED_SPORTS.map((sport) => {
                      const active = selectedGroups.includes(sport.key);
                      return (
                        <button
                          key={sport.key}
                          type="button"
                          onClick={() => toggleProfessionalGroup(sport.key)}
                          disabled={setAffinityGroupsMutation.isPending}
                          aria-pressed={active}
                          className={clsx(
                            'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60',
                            active
                              ? 'bg-primary text-on-primary'
                              : 'border border-outline-variant/50 bg-surface text-on-surface-variant hover:bg-surface-container-low',
                          )}
                        >
                          {active && <Check size={15} strokeWidth={3} aria-hidden />}
                          {sport.label}
                        </button>
                      );
                    })}
                  </div>
                  {feedback && <p role="alert" className="mt-3 font-sans text-body-sm text-error">{feedback}</p>}
                </section>
              )}

              <div className={isProfessional ? 'mt-8' : ''}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="font-sans text-title text-on-surface">{t('profile.business.ownedTitle')}</h2>
                    <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                      {t('profile.business.ownedDescription')}
                    </p>
                  </div>
                  {isProfessional && ownedBusinesses.length > 0 && (
                    <Link
                      to="/negocios/novo"
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-sans text-label text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Plus size={17} aria-hidden />
                      {t('profile.business.createShort')}
                    </Link>
                  )}
                </div>

                <div className="mt-4">
                  {isLoadingOwned ? (
                    <LoadingBlock label={t('profile.business.loading')} />
                  ) : ownedError ? (
                    <ErrorBlock message={t('profile.business.loadError')} />
                  ) : ownedBusinesses.length > 0 ? (
                    <div className="divide-y divide-outline-variant/25 rounded-2xl bg-surface">
                      {ownedBusinesses.map((business) => (
                        <BusinessListItem
                          key={business.id}
                          business={business}
                          dateFormatter={dateFormatter}
                          onInvite={() => openInvite(business)}
                          manageLabel={t('profile.business.manage')}
                          inviteLabel={t('profile.business.invite.action')}
                          verifiedLabel={t('profile.business.verified')}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <EmptyBlock
                        icon={isProfessional ? BriefcaseBusiness : ShieldCheck}
                        title={isProfessional ? t('profile.business.emptyOwnedTitle') : t('profile.business.activateTitle')}
                        description={
                          isProfessional
                            ? t('profile.business.emptyOwnedDescription')
                            : t('profile.business.activateDescription')
                        }
                      />
                      {isProfessional && (
                        <Link
                          to="/negocios/novo"
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/80"
                        >
                          <Plus size={18} aria-hidden />
                          {t('profile.business.createBusiness')}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section role="tabpanel" aria-labelledby="invited-tab" className="pt-6">
              {pendingCount > 0 && (
                <div className="mb-6 flex gap-3 rounded-2xl bg-primary/10 p-4 text-on-surface" role="status">
                  <BellRing size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <div>
                    <p className="font-sans text-body font-semibold">
                      {pendingCount === 1
                        ? t('profile.business.invite.pendingOne')
                        : `${pendingCount} ${t('profile.business.invite.pendingMany')}`}
                    </p>
                    <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                      {t('profile.business.invite.pendingHint')}
                    </p>
                  </div>
                </div>
              )}

              <h2 className="font-sans text-title text-on-surface">{t('profile.business.invitedTitle')}</h2>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                {t('profile.business.invitedDescription')}
              </p>

              <div className="mt-4">
                {isLoadingConnections ? (
                  <LoadingBlock label={t('profile.business.loading')} />
                ) : connectionsError ? (
                  <ErrorBlock message={t('profile.business.loadError')} />
                ) : connections.length > 0 ? (
                  <div className="space-y-3">
                    {connections.map((connection) => (
                      <ConnectionItem
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
                    {respondMutation.isError && (
                      <p role="alert" className="font-sans text-body-sm text-error">
                        {t('profile.business.invite.respondError')}
                      </p>
                    )}
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
          )}
        </main>
      </div>

      <BottomSheet
        open={Boolean(inviteBusiness)}
        onClose={closeInvite}
        title={t('profile.business.invite.title')}
        description={inviteBusiness?.name}
      >
        <form onSubmit={submitInvite} className="space-y-4 px-5 pb-6 pt-4">
          <TextField
            label={t('profile.business.invite.username')}
            value={inviteUsername}
            placeholder="@usuario"
            autoCapitalize="none"
            autoCorrect="off"
            error={inviteError}
            hint={t('profile.business.invite.usernameHint')}
            onChange={(event) => setInviteUsername(event.target.value)}
          />
          <SelectField
            label={t('profile.business.invite.role')}
            value={inviteRole}
            onChange={(value) => setInviteRole(value as 'staff' | 'owner')}
            options={[
              { value: 'staff', label: t('profile.business.role.collaborator') },
              { value: 'owner', label: t('profile.business.role.owner') },
            ]}
          />
          <p className="font-sans text-body-sm text-on-surface-variant">
            {t('profile.business.invite.roleHint')}
          </p>
          {inviteSuccess && <p role="status" className="font-sans text-body-sm text-primary">{inviteSuccess}</p>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeInvite}
              disabled={inviteMutation.isPending}
              className="min-h-11 flex-1 rounded-xl border border-outline-variant/50 px-4 font-sans text-label text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {t('profile.business.invite.cancel')}
            </button>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {inviteMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {inviteMutation.isPending ? t('profile.business.invite.sending') : t('profile.business.invite.send')}
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
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
        active ? 'bg-surface text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface',
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

function BusinessListItem({
  business,
  dateFormatter,
  onInvite,
  manageLabel,
  inviteLabel,
  verifiedLabel,
}: {
  business: BusinessRow;
  dateFormatter: Intl.DateTimeFormat;
  onInvite: () => void;
  manageLabel: string;
  inviteLabel: string;
  verifiedLabel: string;
}) {
  const createdAt = business.created_at ? dateFormatter.format(new Date(business.created_at)) : null;
  const sports = (business.sports ?? []).map(sportLabel).join(', ');
  const kind = business.business_type === 'independent'
    ? 'Negócio independente'
    : business.business_type === 'company'
      ? 'Negócio empresarial'
      : business.kind
        ? businessKindLabel[business.kind] ?? business.kind
        : 'Negócio';
  const status = business.status ? businessStatusLabel[business.status] ?? business.status : null;

  return (
    <article className="px-3 py-4">
      <div className="flex gap-3">
        <BusinessLogo name={business.name} logoUrl={business.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-sans text-body font-semibold text-on-surface">{business.name}</h3>
            {business.verified && <ShieldCheck size={17} className="shrink-0 text-primary" aria-label={verifiedLabel} />}
          </div>
          <p className="mt-1 line-clamp-2 font-sans text-body-sm text-on-surface-variant">
            {[kind, sports, createdAt].filter(Boolean).join(' · ')}
          </p>
          {status && (
            <span className="mt-2 inline-flex rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">
              {status}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2 pl-14">
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/50 px-3 font-sans text-label text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UserPlus size={16} aria-hidden />
          {inviteLabel}
        </button>
        <Link
          to={`/negocios/${business.id}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-surface-container-low px-3 font-sans text-label text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {manageLabel}
          <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function ConnectionItem({
  connection,
  isResponding,
  onRespond,
}: {
  connection: BusinessConnection;
  isResponding: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const { t } = useTranslation();
  const role = connection.role === 'owner'
    ? t('profile.business.role.owner')
    : t('profile.business.role.collaborator');

  return (
    <article className="rounded-2xl bg-surface p-4">
      <div className="flex gap-3">
        <BusinessLogo name={connection.organization_name} logoUrl={connection.logo_url} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-sans text-body font-semibold text-on-surface">
              {connection.organization_name}
            </h3>
            {connection.verified && (
              <ShieldCheck size={17} className="shrink-0 text-primary" aria-label={t('profile.business.verified')} />
            )}
          </div>
          <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
            {connection.membership_status === 'pending'
              ? `${t('profile.business.invite.invitedBy')} ${connection.inviter_name}${connection.inviter_username ? ` (@${connection.inviter_username})` : ''}`
              : `${t('profile.business.invite.ownerLabel')} ${connection.owner_name}${connection.owner_username ? ` (@${connection.owner_username})` : ''}`}
          </p>
          <span className="mt-2 inline-flex rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">
            {role}
          </span>
        </div>
      </div>

      {connection.membership_status === 'pending' ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={isResponding}
            onClick={() => onRespond(false)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/50 font-sans text-label text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            <X size={16} aria-hidden />
            {t('profile.business.invite.reject')}
          </button>
          <button
            type="button"
            disabled={isResponding}
            onClick={() => onRespond(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary font-sans text-label text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {isResponding ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
            {t('profile.business.invite.accept')}
          </button>
        </div>
      ) : (
        <Link
          to={`/negocios/${connection.organization_id}`}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-primary px-4 font-sans text-label text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('profile.business.manage')}
          <ChevronRight size={16} aria-hidden />
        </Link>
      )}
    </article>
  );
}

function BusinessLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return logoUrl ? (
    <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
  ) : (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
      aria-label={name}
    >
      <Building2 size={20} aria-hidden />
    </span>
  );
}

function EmptyBlock({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container-low px-4 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
        <Icon size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-body font-semibold text-on-surface">{title}</h3>
        <p className="mt-1 max-w-[46ch] font-sans text-body-sm text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="space-y-3 rounded-2xl bg-surface px-3 py-4" aria-label={label}>
      <div className="h-4 w-2/5 animate-pulse rounded bg-surface-container-high" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
      <p className="font-sans text-body">{message}</p>
    </div>
  );
}
