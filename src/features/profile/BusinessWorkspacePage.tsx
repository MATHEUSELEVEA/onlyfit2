import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { supabase } from '@/lib/supabase';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SelectField } from '@/components/ui/TextField';
import { UserPickerField } from './components/UserPickerField';
import type { UserSuggestion } from './useUserSearch';

interface BusinessWorkspaceRow {
  id: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  business_type: string | null;
  owner_id: string;
}

export function BusinessWorkspacePage() {
  const { businessId } = useParams();
  const { session } = useAuth();
  const { t } = useTranslation();
  const { data: business, isLoading, isError } = useQuery({
    queryKey: ['mobile-business-workspace', businessId],
    enabled: Boolean(businessId),
    queryFn: async (): Promise<BusinessWorkspaceRow | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id,name,logo_url,verified,business_type,owner_id')
        .eq('id', businessId!)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessWorkspaceRow | null;
    },
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  // Escolher na busca é o caminho normal; digitar o @ exato continua valendo,
  // então o que vai para a RPC é a seleção quando existe, senão o texto.
  const [invitedUser, setInvitedUser] = useState<UserSuggestion | null>(null);
  const [inviteRole, setInviteRole] = useState<'staff' | 'owner'>('staff');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{
    username: string;
    name: string | null;
    role: 'staff' | 'owner';
  } | null>(null);
  const inviteFeedbackRef = useRef<HTMLDivElement | null>(null);

  const isOwner = Boolean(business && session && business.owner_id === session.user.id);
  const invitedUsername = (invitedUser?.username ?? inviteUsername).trim().replace(/^@/, '');

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!businessId) return;
      const { error } = await supabase.rpc('invite_organization_member', {
        p_organization_id: businessId,
        p_username: invitedUsername,
        p_role: inviteRole,
      });
      // O erro do PostgREST é objeto plain, não Error: jogado cru, o onError
      // abaixo não reconheceria nenhum caso e tudo viraria a mensagem genérica.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setInviteError(null);
      setInviteFeedback({ username: invitedUsername, name: invitedUser?.name ?? null, role: inviteRole });
      setInviteOpen(false);
      setInviteUsername('');
      setInvitedUser(null);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : '';
      setInviteFeedback(null);
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

  useEffect(() => {
    if (!inviteFeedback || inviteOpen) return;
    inviteFeedbackRef.current?.focus();
  }, [inviteFeedback, inviteOpen]);

  function openInvite() {
    setInviteUsername('');
    setInvitedUser(null);
    setInviteRole('staff');
    setInviteError(null);
    setInviteFeedback(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    if (inviteMutation.isPending) return;
    setInviteOpen(false);
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    setInviteFeedback(null);
    if (invitedUsername.length < 2) {
      setInviteError(t('profile.business.invite.usernameRequired'));
      return;
    }
    inviteMutation.mutate();
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto min-h-full w-full max-w-[640px] bg-background">
        <header className="sticky top-0 z-10 border-b border-outline-variant/20 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Link
              to="/negocios"
              aria-label={t('profile.business.workspace.back')}
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-container-high"
            >
              <ArrowLeft size={21} aria-hidden />
            </Link>
            <h1 className="truncate font-sans text-title-lg text-on-surface">
              {business?.name ?? t('profile.business.workspace.title')}
            </h1>
          </div>
        </header>

        <main className="px-4 pb-8 pt-6">
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-primary" aria-label={t('profile.business.loading')} />
            </div>
          ) : isError || !business ? (
            <div className="rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
              <p className="font-sans text-body font-semibold">{t('profile.business.workspace.loadError')}</p>
              <Link to="/negocios" className="mt-3 inline-flex min-h-11 items-center font-sans text-label underline">
                {t('profile.business.workspace.backToBusinesses')}
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {business.logo_url ? (
                  <img src={business.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Building2 size={27} aria-hidden />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-sans text-title text-on-surface">{business.name}</h2>
                    {business.verified && (
                      <ShieldCheck size={18} className="shrink-0 text-primary" aria-label={t('profile.business.verified')} />
                    )}
                  </div>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                    {business.business_type === 'company'
                      ? t('profile.business.create.company')
                      : t('profile.business.create.independent')}
                  </p>
                </div>
              </div>

              {inviteFeedback && (
                <div
                  ref={inviteFeedbackRef}
                  tabIndex={-1}
                  role="status"
                  aria-live="polite"
                  className="mt-6 flex gap-3 rounded-2xl bg-primary-container px-4 py-3 text-on-primary-container outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <CheckCircle2 size={19} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-sans text-body font-semibold">
                      {t('profile.business.invite.successTitle')}
                    </span>
                    <span className="mt-0.5 block font-sans text-body-sm">
                      {inviteFeedback.name ? `${inviteFeedback.name} · ` : ''}@{inviteFeedback.username} ·{' '}
                      {inviteFeedback.role === 'owner' ? t('profile.business.role.owner') : t('profile.business.role.collaborator')}
                    </span>
                    <span className="mt-1 block font-sans text-body-sm">
                      {t('profile.business.invite.success')}
                    </span>
                  </span>
                </div>
              )}

              {isOwner && (
                <section className="mt-8" aria-labelledby="team-title">
                  <h2 id="team-title" className="px-1 font-sans text-label text-on-surface">
                    {t('profile.business.workspace.teamTitle')}
                  </h2>
                  <div className="mt-2 overflow-hidden rounded-2xl bg-surface-container">
                    <button
                      type="button"
                      onClick={openInvite}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <UserPlus size={20} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sans text-body font-semibold text-primary">
                          {t('profile.business.invite.title')}
                        </span>
                        <span className="mt-0.5 block truncate font-sans text-body-sm text-on-surface-variant">
                          {t('profile.business.workspace.teamHint')}
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-primary" aria-hidden />
                    </button>
                  </div>
                </section>
              )}

              <section className="mt-8 rounded-2xl bg-surface-container p-5">
                <h2 className="font-sans text-title text-on-surface">{t('profile.business.workspace.comingTitle')}</h2>
                <p className="mt-2 max-w-[48ch] font-sans text-body text-on-surface-variant">
                  {t('profile.business.workspace.comingDescription')}
                </p>
              </section>
            </>
          )}
        </main>
      </div>

      <BottomSheet
        open={inviteOpen}
        onClose={closeInvite}
        title={t('profile.business.invite.title')}
        description={business?.name}
      >
        <form onSubmit={submitInvite} className="space-y-4 px-5 pb-6 pt-4">
          <UserPickerField
            label={t('profile.business.invite.username')}
            query={inviteUsername}
            onQueryChange={(value) => {
              setInviteUsername(value);
              setInviteError(null);
            }}
            selected={invitedUser}
            onSelect={setInvitedUser}
            disabled={inviteMutation.isPending}
            error={inviteError}
            hint={t('profile.business.invite.usernameHint')}
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
          <p className="font-sans text-body-sm text-on-surface-variant">{t('profile.business.invite.roleHint')}</p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeInvite}
              disabled={inviteMutation.isPending}
              className="min-h-11 flex-1 rounded-xl bg-surface-container px-4 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {t('profile.business.invite.cancel')}
            </button>
            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
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
