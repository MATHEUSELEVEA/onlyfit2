import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Database,
  Gavel,
  Globe2,
  Inbox,
  LogOut,
  Menu,
  Plus,
  PencilLine,
  Share2,
  Stethoscope,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { applyFontScale, readFontScale } from '@/theme/fontScale';
import { THEMES, useTheme, type ThemeId } from '@/theme/ThemeProvider';
import { MenuDrawer } from '@/components/layout/MenuDrawer';
import { ShareSheet } from '@/components/ui/ShareSheet';

const LANGUAGE_KEY = 'onlyfit.language';

const themeSwatches: Record<ThemeId, string> = {
  preto: '#131313',
  azul: '#5341cd',
  laranja: '#ff5e1a',
};

interface ProfileSummary {
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isCreator: boolean;
}

export function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { session, signOut } = useAuth();
  const [fontScale, setFontScale] = useState(readFontScale);
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_KEY) ?? 'PT');
  const [professionalTools, setProfessionalTools] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const userId = session?.user.id;
  const { data: profile } = useQuery({
    queryKey: ['my-profile-summary', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ProfileSummary | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, full_name, avatar_url, is_creator')
        .eq('id', userId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        username: data.username,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        isCreator: Boolean(data.is_creator),
      };
    },
  });

  const metadata = session?.user.user_metadata;
  const displayName = profile?.fullName ?? metadata?.full_name ?? metadata?.name ?? 'Meu perfil';
  const avatarUrl = profile?.avatarUrl ?? metadata?.avatar_url ?? metadata?.picture ?? null;
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'M';
  // Link público do perfil (rota de creator); sem username compartilha o app.
  const shareUrl = profile?.username
    ? `${window.location.origin}/creator/${encodeURIComponent(profile.username)}`
    : window.location.origin;

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
  }

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

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        {/* ---------- Herói: foto preenchendo o topo ---------- */}
        <header>
          <div className="relative h-[46vh] max-h-[430px] min-h-[300px] w-full overflow-hidden">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`Foto de ${displayName}`}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-surface-tint">
                <span className="font-sans text-display text-on-primary">{initial}</span>
              </div>
            )}

            {/* Legibilidade dos controles flutuantes no topo */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent"
            />
            {/* A imagem termina em fade antes do nome */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
            />

            {/* Logo + ações flutuando sobre a imagem */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <span className="font-sans text-title-lg text-white drop-shadow">OnlyFit</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Compartilhar perfil"
                  onClick={() => setShareOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform active:scale-95"
                >
                  <Share2 size={20} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Abrir menu de navegação"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform active:scale-95"
                >
                  <Menu size={22} aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {/* Identidade, abaixo da imagem */}
          <div className="flex flex-col items-center px-6 pb-6 text-center">
            <h1
              id="profile-name"
              className="max-w-full text-balance break-words font-sans text-title-lg text-on-surface"
            >
              {displayName}
            </h1>
            <span className="mt-2 inline-flex items-center rounded-full bg-secondary-container px-3 py-1 font-sans text-eyebrow uppercase text-on-secondary-container">
              {profile?.isCreator ? 'Profissional' : 'Membro'}
            </span>

            <Link
              to="/studio"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-sans text-label text-on-primary shadow-sm transition-transform active:scale-[0.98]"
            >
              <Plus size={19} aria-hidden />
              <span>Criar post</span>
            </Link>
          </div>
        </header>

        {/* ---------- Configurações ---------- */}
        <section className="space-y-8 border-t border-outline-variant/30 px-6 py-8" aria-labelledby="settings-title">
          <h2 id="settings-title" className="font-sans text-title-lg text-on-surface">
            Central de Configurações
          </h2>

          {/* Preferências */}
          <div className="space-y-3">
            <SectionEyebrow>Preferências</SectionEyebrow>

            <SettingCard>
              <button type="button" className="flex w-full items-center gap-3 text-left">
                <IconChip icon={Inbox} />
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body font-semibold text-on-surface">
                    Mensagens
                  </span>
                  <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                    Sua caixa de entrada
                  </span>
                </span>
                <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
              </button>
            </SettingCard>

            <SettingCard>
              <div className="flex items-center gap-3">
                <IconChip icon={Globe2} />
                <p className="min-w-0 flex-1 font-sans text-body font-semibold text-on-surface">
                  Idioma
                </p>
                <div
                  className="flex gap-1 rounded-full bg-surface-container-low p-1"
                  role="group"
                  aria-label="Idioma do aplicativo"
                >
                  {['PT', 'EN'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => changeLanguage(option)}
                      aria-pressed={language === option}
                      className={clsx(
                        'min-h-8 min-w-10 rounded-full px-3 font-sans text-counter transition-colors',
                        language === option
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </SettingCard>

            <SettingCard>
              <label
                htmlFor="font-scale"
                className="flex items-center gap-3 font-sans text-body font-semibold text-on-surface"
              >
                <IconChip icon={PencilLine} />
                Tamanho da fonte
              </label>
              <div className="mt-4 flex items-center gap-4 text-on-surface">
                <span className="font-sans text-counter">A</span>
                <input
                  id="font-scale"
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
                  max="3"
                  min="1"
                  step="1"
                  type="range"
                  value={fontScale}
                  onChange={(event) => setFontScale(Number(event.target.value))}
                />
                <span className="font-sans text-title-lg">A</span>
              </div>
            </SettingCard>

            <SettingCard>
              <p className="font-sans text-body font-semibold text-on-surface">Tema do aplicativo</p>
              <div
                className="mt-4 flex items-center gap-4"
                role="group"
                aria-label="Tema do aplicativo"
              >
                {THEMES.map(({ id, label }) => {
                  const active = theme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTheme(id)}
                      aria-label={label}
                      aria-pressed={active}
                      className={clsx(
                        'relative flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90',
                        active
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                          : 'ring-1 ring-outline-variant/40',
                      )}
                    >
                      <span
                        className="h-8 w-8 rounded-full"
                        style={{ backgroundColor: themeSwatches[id] }}
                      />
                      {active && (
                        <Check
                          size={15}
                          className="absolute text-white"
                          strokeWidth={3}
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </SettingCard>
          </div>

          {/* Conta e privacidade */}
          <div className="space-y-3">
            <SectionEyebrow>Conta e privacidade</SectionEyebrow>

            <div className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface shadow-sm">
              <ProfileLink
                icon={PencilLine}
                title="Editar Perfil"
                description="Dados pessoais, endereços e contatos"
              />
              <ProfileLink
                icon={WalletCards}
                title="Formas de Pagamento"
                description="Cartões, PIX e endereços de cobrança"
              />
              <ProfileLink
                icon={Stethoscope}
                title="Perfil de Saúde"
                description="Declarações, registros clínicos e exames"
              />
              <ProfileLink
                icon={Database}
                title="Privacidade de Dados (LGPD)"
                description="Gerenciar memória, ver por data e apagar"
              />

              <div className="flex min-h-[72px] items-center gap-4 border-t border-outline-variant/25 px-4 py-4">
                <IconChip icon={BriefcaseBusiness} />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-body font-medium text-on-surface">
                    Ferramentas Profissionais
                  </p>
                  <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                    Habilitar recursos avançados
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={professionalTools}
                  aria-label="Ferramentas profissionais"
                  onClick={() => setProfessionalTools((enabled) => !enabled)}
                  className={clsx(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    professionalTools ? 'bg-primary' : 'bg-surface-container-highest',
                  )}
                >
                  <span
                    className={clsx(
                      'absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-container-lowest shadow-sm transition-transform',
                      professionalTools && 'translate-x-5',
                    )}
                  />
                </button>
              </div>

              <ProfileLink
                icon={Gavel}
                title="Privacidade e Termos"
                description="Consentimento LGPD e termos de uso"
              />

              {/* Último botão da tela: sair da conta */}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors active:bg-error-container/30 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
                  <LogOut size={19} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-body font-medium text-error">
                    {signingOut ? 'Saindo...' : 'Sair'}
                  </span>
                  <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
                    Encerrar a sessão neste aparelho
                  </span>
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isProfessional={profile?.isCreator || professionalTools}
      />
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={shareUrl}
        text={`Veja o perfil de ${displayName} no OnlyFit`}
      />
    </div>
  );
}

function SettingCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface p-4 shadow-sm">
      {children}
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 font-sans text-eyebrow uppercase text-on-surface-variant">{children}</h3>
  );
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

function ProfileLink({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[72px] w-full items-center gap-4 border-t border-outline-variant/25 px-4 py-4 text-left transition-colors first:border-t-0 active:bg-surface-container-low"
    >
      <IconChip icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
      <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
    </button>
  );
}
