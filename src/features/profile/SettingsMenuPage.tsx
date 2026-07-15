import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CalendarCheck,
  Dumbbell,
  Gavel,
  Inbox,
  Loader2,
  LogOut,
  Palette,
  PencilLine,
  ReceiptText,
  Salad,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { myProfileQueryKey, useMyProfile, type MyProfile } from './useMyProfile';
import { IconChip, ProfileLink, SectionEyebrow } from './components/SettingsPrimitives';
import { useUnreadCount } from '@/features/messages/useUnreadCount';

// Central de Configurações em tela cheia, aberta pelo menu de barras do Perfil.
export function SettingsMenuPage() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [professionalFeedback, setProfessionalFeedback] = useState<string | null>(null);

  const userId = session?.user.id;
  const profileQueryKey = myProfileQueryKey(userId);
  const { data: profile } = useMyProfile();
  const { data: unreadCount = 0 } = useUnreadCount();
  const isProfessional = profile?.isProfessional ?? false;

  const setProfessionalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await supabase.rpc('set_professional_tools_enabled', {
        p_enabled: enabled,
      });
      if (error) throw error;
      return data as { professional_shell_enabled: boolean; is_creator: boolean };
    },
    onSuccess: (data) => {
      setProfessionalFeedback(null);
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
    onError: () => {
      setProfessionalFeedback(t('profile.business.activationError'));
    },
  });

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // Sessão zerada => AuthenticatedApp troca para a tela de login.
    } finally {
      setSigningOut(false);
    }
  }

  function toggleProfessional() {
    if (!userId || setProfessionalMutation.isPending) return;
    setProfessionalFeedback(null);
    setProfessionalMutation.mutate(!isProfessional);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={t('profile.settingsTitle')} backFallback="/perfil" />

      <section className="mx-auto w-full max-w-[720px] space-y-8 px-6 py-6">
        {/* Navegação */}
        <div className="space-y-3">
          <SectionEyebrow>{t('profile.section.navigation')}</SectionEyebrow>

          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            <ProfileLink
              icon={Stethoscope}
              title={t('profile.health.title')}
              description={t('profile.health.description')}
              to="/perfil/saude"
            />
            <ProfileLink
              icon={Dumbbell}
              title={t('profile.training.title')}
              description={t('profile.training.description')}
              to="/meu-fit/treino"
            />
            <ProfileLink
              icon={Salad}
              title={t('profile.diet.title')}
              description={t('profile.diet.description')}
              to="/meu-fit/dieta"
            />
            <ProfileLink
              icon={Inbox}
              title={t('profile.messages.title')}
              description={t('profile.messages.description')}
              to="/mensagens"
              badge={unreadCount}
            />
            <ProfileLink
              icon={CalendarCheck}
              title={t('profile.enrollments.title')}
              description={t('profile.enrollments.description')}
              to="/meus-produtos"
            />
          </div>
        </div>

        {/* Conta */}
        <div className="space-y-3">
          <SectionEyebrow>{t('profile.section.account')}</SectionEyebrow>

          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            <ProfileLink
              icon={PencilLine}
              title={t('profile.editProfile.title')}
              description={t('profile.editProfile.description')}
              to="/perfil/editar"
            />
            <ProfileLink
              icon={WalletCards}
              title={t('profile.payment.title')}
              description={t('profile.payment.description')}
            />
            <ProfileLink
              icon={Palette}
              title={t('profile.visual.title')}
              description={t('profile.visual.description')}
              to="/perfil/visual"
            />
            <ProfileLink
              icon={Gavel}
              title={t('profile.terms.title')}
              description={t('profile.terms.description')}
              to="/perfil/privacidade-termos"
            />
          </div>
        </div>

        {/* Profissional */}
        <div className="space-y-3">
          <SectionEyebrow>{t('profile.section.professional')}</SectionEyebrow>

          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            <ProfessionalSwitchRow
              checked={isProfessional}
              disabled={!userId || setProfessionalMutation.isPending}
              pending={setProfessionalMutation.isPending}
              onToggle={toggleProfessional}
              icon={ShieldCheck}
              title={t('profile.becomeProfessional.title')}
              description={t('profile.business.professionalToggleDescription')}
            />
            {isProfessional && (
              <>
                <ProfileLink
                  icon={Building2}
                  title={t('profile.business.title')}
                  description={t('profile.business.description')}
                  to="/negocios"
                />
                <ProfileLink
                  icon={UsersRound}
                  title={t('profile.customerManagement.title')}
                  description={t('profile.customerManagement.description')}
                />
                <ProfileLink
                  icon={ReceiptText}
                  title={t('profile.financialManagement.title')}
                  description={t('profile.financialManagement.description')}
                />
              </>
            )}
          </div>
          {professionalFeedback && (
            <p role="alert" className="px-1 font-sans text-body-sm text-error">
              {professionalFeedback}
            </p>
          )}
        </div>

        {/* Sessão */}
        <div className="space-y-3">
          <SectionEyebrow>{t('profile.section.session')}</SectionEyebrow>

          <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
            {/* Último botão da tela: sair da conta */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors first:border-t-0 active:bg-error-container/30 disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
                <LogOut size={19} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-body font-medium text-error">
                  {signingOut ? t('profile.signOut.titleLoading') : t('profile.signOut.title')}
                </span>
                <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                  {t('profile.signOut.description')}
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfessionalSwitchRow({
  icon,
  title,
  description,
  checked,
  disabled,
  pending,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 first:border-t-0">
      <IconChip icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      {pending && <Loader2 size={16} className="shrink-0 animate-spin text-on-surface-variant" aria-hidden />}
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
