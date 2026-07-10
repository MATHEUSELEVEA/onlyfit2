import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Database,
  Flame,
  Gavel,
  Globe2,
  Inbox,
  MessageSquare,
  PencilLine,
  Share2,
  Stethoscope,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { applyFontScale, readFontScale } from '@/theme/fontScale';
import { THEMES, useTheme, type ThemeId } from '@/theme/ThemeProvider';

const LANGUAGE_KEY = 'onlyfit.language';

const themeSwatches: Record<ThemeId, string> = {
  preto: '#131313',
  azul: '#5341cd',
  laranja: '#ff5e1a',
};

interface ProfileSummary {
  fullName: string | null;
  avatarUrl: string | null;
  isCreator: boolean;
}

export function ProfilePage() {
  const { theme, setTheme } = useTheme();
  const { session } = useAuth();
  const [fontScale, setFontScale] = useState(readFontScale);
  const [language, setLanguage] = useState(() => localStorage.getItem(LANGUAGE_KEY) ?? 'PT');
  const [professionalTools, setProfessionalTools] = useState(false);

  const userId = session?.user.id;
  const { data: profile } = useQuery({
    queryKey: ['my-profile-summary', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ProfileSummary | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, is_creator')
        .eq('id', userId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      return {
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        isCreator: Boolean(data.is_creator),
      };
    },
  });

  const metadata = session?.user.user_metadata;
  const displayName = profile?.fullName ?? metadata?.full_name ?? metadata?.name ?? 'Meu perfil';
  const avatarUrl = profile?.avatarUrl ?? metadata?.avatar_url ?? metadata?.picture ?? null;
  const streak = Number(metadata?.streak ?? 0);
  const following = Number(metadata?.following_count ?? 0);
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'M';

  useEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  function changeLanguage(nextLanguage: string) {
    setLanguage(nextLanguage);
    localStorage.setItem(LANGUAGE_KEY, nextLanguage);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background md:my-6 md:overflow-hidden md:rounded-3xl md:border md:border-outline-variant/30 md:shadow-xl">
        {/* ---------- Cabeçalho / herói ---------- */}
        <header className="relative">
          {/* Faixa de capa com gradiente de marca e brilho decorativo. */}
          <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary/25 via-secondary-container/40 to-surface-container-high sm:h-44">
            <span
              aria-hidden
              className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
            />
            <span
              aria-hidden
              className="absolute -bottom-24 left-6 h-52 w-52 rounded-full bg-surface-tint/10 blur-3xl"
            />

            <div className="absolute inset-x-0 top-0 flex justify-end p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <button
                type="button"
                aria-label="Compartilhar perfil"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-surface/80 text-on-surface shadow-md ring-1 ring-outline-variant/20 backdrop-blur-md transition-transform active:scale-95"
              >
                <Share2 size={20} aria-hidden />
              </button>
            </div>
          </div>

          {/* Avatar sobreposto + identidade. */}
          <div className="px-6 pb-6">
            <div className="-mt-14 flex flex-col items-center text-center">
              <div className="rounded-full bg-surface p-1.5 shadow-lg ring-1 ring-outline-variant/20">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`Foto de ${displayName}`}
                    className="h-24 w-24 rounded-full object-cover object-top"
                  />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-surface-tint text-4xl font-bold text-on-primary">
                    {initial}
                  </span>
                )}
              </div>

              <h1
                id="profile-name"
                className="mt-4 max-w-full text-balance break-words text-2xl font-bold leading-tight text-on-surface sm:text-3xl"
              >
                {displayName}
              </h1>
              <span className="mt-2 inline-flex items-center rounded-full bg-secondary-container px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-on-secondary-container">
                {profile?.isCreator ? 'Profissional' : 'Membro'}
              </span>

              <button
                type="button"
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-on-primary shadow-sm transition-transform active:scale-[0.98]"
              >
                <MessageSquare size={19} aria-hidden />
                <span>Mensagens</span>
              </button>
            </div>

            {/* Estatísticas. */}
            <div className="mt-7 grid grid-cols-2 gap-3">
              <StatCard
                icon={Flame}
                label="Sequência atual"
                value={streak}
                unit={streak === 1 ? 'semana' : 'semanas'}
                accent
              />
              <StatCard
                icon={Users}
                label="Comunidade"
                value={following}
                unit="seguindo"
              />
            </div>
          </div>
        </header>

        {/* ---------- Configurações ---------- */}
        <section className="space-y-8 border-t border-outline-variant/30 px-6 py-8" aria-labelledby="settings-title">
          <h2 id="settings-title" className="text-xl font-bold text-on-surface">
            Central de Configurações
          </h2>

          {/* Preferências */}
          <div className="space-y-3">
            <SectionEyebrow>Preferências</SectionEyebrow>

            <SettingCard>
              <button type="button" className="flex w-full items-center gap-3 text-left">
                <IconChip icon={Inbox} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-on-surface">Mensagens</span>
                  <span className="mt-0.5 block text-xs text-on-surface-variant">
                    Sua caixa de entrada
                  </span>
                </span>
                <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
              </button>
            </SettingCard>

            <SettingCard>
              <div className="flex items-center gap-3">
                <IconChip icon={Globe2} />
                <p className="min-w-0 flex-1 font-semibold text-on-surface">Idioma</p>
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
                        'min-h-8 min-w-10 rounded-full px-3 text-xs font-bold transition-colors',
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
                className="flex items-center gap-3 font-semibold text-on-surface"
              >
                <IconChip icon={PencilLine} />
                Tamanho da fonte
              </label>
              <div className="mt-4 flex items-center gap-4 text-on-surface">
                <span className="text-xs">A</span>
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
                <span className="text-xl font-semibold">A</span>
              </div>
            </SettingCard>

            <SettingCard>
              <p className="font-semibold text-on-surface">Tema do aplicativo</p>
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
                          className={clsx(
                            'absolute',
                            id === 'preto' ? 'text-white' : 'text-white',
                          )}
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
                  <p className="font-medium text-on-surface">Ferramentas Profissionais</p>
                  <p className="mt-0.5 text-xs text-on-surface-variant">
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
            </div>
          </div>
        </section>
      </div>
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
    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
      {children}
    </h3>
  );
}

function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon size={19} aria-hidden />
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low p-4">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-full',
            accent ? 'bg-tertiary-container/60 text-tertiary' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon size={17} aria-hidden />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {label}
        </p>
      </div>
      <p className="mt-3 flex items-baseline gap-1.5 text-on-surface">
        <strong className="text-2xl font-bold leading-none">{value}</strong>
        <span className="text-sm font-medium text-on-surface-variant">{unit}</span>
      </p>
    </div>
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
        <span className="block font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block text-xs text-on-surface-variant">{description}</span>
      </span>
      <ChevronRight size={19} className="shrink-0 text-outline" aria-hidden />
    </button>
  );
}
