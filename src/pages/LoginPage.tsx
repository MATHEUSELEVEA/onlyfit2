import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Gift,
  Globe,
  IdCard,
  Loader2,
  Lock,
  Mail,
  User,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BackgroundSlideshow } from '@/components/BackgroundSlideshow';
import { normalizeEmail } from '@/lib/auth';
import { formatCpf, isValidCpf, normalizeCpf } from '@/lib/cpf';
import { checkUsernameAvailability, normalizeOnboardingUsername } from '@/lib/username';
import { COUNTRY_OPTIONS, countryName, detectCountryCode } from '@/lib/countries';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string | null; subtitle: string | null; cta: string }> = {
  signin: {
    title: null,
    subtitle: null,
    cta: 'Entrar',
  },
  signup: {
    title: 'Crie sua conta',
    subtitle: 'Comece a treinar com os melhores.',
    cta: 'Criar conta',
  },
  forgot: {
    title: 'Recuperar senha',
    subtitle: 'Enviaremos um link para redefinir sua senha.',
    cta: 'Enviar link',
  },
};

/** Permite deep-link direto para uma aba (`#signup`, `#forgot`), como no v1. */
function initialMode(): Mode {
  if (typeof window === 'undefined') return 'signin';
  const hash = window.location.hash.replace('#', '');
  return hash === 'signup' || hash === 'forgot' ? hash : 'signin';
}

export function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Campos exclusivos do cadastro (paridade com o Signup do v1).
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [countryCode, setCountryCode] = useState(detectCountryCode);
  const [cpf, setCpf] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[mode];
  const requiresCpf = countryCode === 'BR';
  const debouncedUsername = useDebouncedValue(username, 500);

  // Checagem de disponibilidade de username enquanto o usuário digita.
  // O reset para `null` acontece no onChange; aqui só a consulta assíncrona.
  useEffect(() => {
    if (mode !== 'signup') return;
    const clean = normalizeOnboardingUsername(debouncedUsername);
    if (clean.length < 3) return;
    let cancelled = false;
    checkUsernameAvailability(clean)
      .then((available) => {
        if (!cancelled) {
          setUsernameAvailable(available);
          setCheckingUsername(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingUsername(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedUsername, mode]);

  const countries = useMemo(
    () => COUNTRY_OPTIONS.map((c) => ({ ...c, name: countryName(c.code) })),
    [],
  );

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setSubmitting(false);
    setShowPassword(false);
  }

  async function handleSignUp(trimmedEmail: string) {
    const cpfDigits = normalizeCpf(cpf);
    if (requiresCpf && cpfDigits.length === 0) {
      setError('Informe seu CPF.');
      return;
    }
    if (requiresCpf && !isValidCpf(cpfDigits)) {
      setError('CPF inválido. Verifique os dígitos.');
      return;
    }

    const cleanUsername = normalizeOnboardingUsername(username);
    if (cleanUsername.length < 3) {
      setError('O nome de usuário precisa ter ao menos 3 caracteres.');
      return;
    }
    const usernameFree = await checkUsernameAvailability(cleanUsername);
    if (!usernameFree) {
      setError('Esse nome de usuário já está em uso.');
      return;
    }

    const { error: signUpError, needsConfirmation } = await signUp(trimmedEmail, password, {
      full_name: fullName.trim(),
      username: cleanUsername,
      country_code: countryCode,
      tax_id: requiresCpf ? cpfDigits : undefined,
      language: 'pt-BR',
    });

    if (signUpError) {
      // A edge function `send-signup-confirmation` já retorna mensagens localizadas.
      setError(signUpError);
      return;
    }

    // Aplica o código de indicação, se informado (idêntico ao v1).
    if (referralCode.trim()) {
      const { data: refResult } = await supabase.rpc('apply_referral_code', {
        p_code: referralCode.trim(),
      });
      const referralError =
        refResult && typeof refResult === 'object' && !Array.isArray(refResult) && 'error' in refResult
          ? String((refResult as { error?: unknown }).error ?? '')
          : '';
      if (referralError) {
        setNotice(`Conta criada, mas o código de indicação não pôde ser aplicado: ${referralError}`);
      }
    }

    if (needsConfirmation) {
      setNotice('Conta criada! Confira seu email para confirmar o acesso.');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const trimmedIdentifier = identifier.trim().replace(/^@/, '').toLowerCase();
    const trimmedEmail = normalizeEmail(email);

    if (mode === 'signin') {
      const { error: signInError } = await signIn(trimmedIdentifier, password);
      if (signInError) setError('Usuário, email ou senha inválidos.');
    } else if (mode === 'signup') {
      await handleSignUp(trimmedEmail);
    } else {
      const { error: resetError } = await resetPassword(trimmedEmail);
      if (resetError) {
        setError('Não foi possível enviar o link. Verifique o email.');
      } else {
        setNotice('Link enviado! Confira sua caixa de entrada.');
      }
    }

    setSubmitting(false);
  }

  return (
    // data-theme fixo: o login sempre usa o tema escuro, mesmo se o usuário
    // tiver escolhido "claro" nas configurações — o fundo é sempre uma foto.
    <div data-theme="preto" className="relative h-full w-full overflow-hidden">
      <BackgroundSlideshow />

      <div className="relative z-10 flex h-full flex-col overflow-y-auto no-scrollbar px-6 pb-safe-bottom pt-safe-top">
        <div className="animate-login-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-end pb-10 pt-16">
          {/* Marca — sobre a mídia de fundo, mesma exceção do feed (texto claro fixo para legibilidade sobre foto). */}
          <header className="mb-8">
            <h1 className="font-sans text-display text-white">
              Only<span className="text-on-media-accent">Fit</span>
            </h1>
            <p className="mt-3 max-w-[16rem] font-sans text-body text-white/70">
              Sua comunidade de alta performance.
            </p>
          </header>

          {/* Card com vidro fosco: mais transparência para deixar a foto de fundo respirar. */}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface/55 p-6 backdrop-blur-xl">
            {(copy.title || copy.subtitle) && (
              <div className="mb-5">
                {copy.title && (
                  <h2 className="font-sans text-title-lg text-on-surface">{copy.title}</h2>
                )}
                {copy.subtitle && (
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{copy.subtitle}</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {mode === 'signup' && (
                <Field icon={<User size={18} />} label="Nome completo">
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="Seu nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                </Field>
              )}

              {mode === 'signup' && (
                <Field icon={<Globe size={18} />} label="País">
                  <select
                    required
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-full bg-transparent font-sans text-body text-on-surface outline-none [&>option]:text-black"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.displayCode ?? c.code})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {mode === 'signup' && requiresCpf && (
                <Field icon={<IdCard size={18} />} label="CPF">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    placeholder="000.000.000-00"
                    value={formatCpf(cpf)}
                    onChange={(e) => setCpf(normalizeCpf(e.target.value))}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                </Field>
              )}

              {mode === 'signup' && (
                <Field icon={<User size={18} />} label="Nome de usuário">
                  <input
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="usuario"
                    value={username}
                    onChange={(e) => {
                      const clean = normalizeOnboardingUsername(e.target.value);
                      setUsername(clean);
                      setUsernameAvailable(null);
                      setCheckingUsername(clean.length >= 3);
                    }}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                  {checkingUsername ? (
                    <Loader2 size={16} className="ml-2 shrink-0 animate-spin text-on-surface-variant" aria-hidden />
                  ) : usernameAvailable === true ? (
                    <CheckCircle2 size={16} className="ml-2 shrink-0 text-primary" aria-hidden />
                  ) : usernameAvailable === false ? (
                    <XCircle size={16} className="ml-2 shrink-0 text-error" aria-hidden />
                  ) : null}
                </Field>
              )}

              {mode === 'signin' ? (
                <Field icon={<User size={18} />} label="Usuário ou email">
                  <input
                    type="text"
                    autoComplete="username"
                    inputMode="email"
                    required
                    placeholder="usuario ou voce@email.com"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                </Field>
              ) : (
              <Field icon={<Mail size={18} />} label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                />
              </Field>
              )}

              {mode !== 'forgot' && (
                <Field icon={<Lock size={18} />} label="Senha">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="ml-2 shrink-0 text-on-surface-variant transition-colors hover:text-on-surface"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </Field>
              )}

              {mode === 'signup' && (
                <Field icon={<Gift size={18} />} label="Código de indicação (opcional)">
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Código de indicação (opcional)"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    className="w-full bg-transparent font-sans text-body text-on-surface placeholder:text-on-surface-variant outline-none"
                  />
                </Field>
              )}

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="-mt-1 self-end font-sans text-body-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
                >
                  Esqueceu a senha?
                </button>
              )}

              {error && (
                <p role="alert" className="font-sans text-body-sm text-error">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="font-sans text-body-sm text-primary">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || (mode === 'signup' && usernameAvailable === false)}
                className="mt-2 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary font-sans text-label text-on-primary transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {submitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
                {copy.cta}
              </button>
            </form>

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="mt-4 w-full text-center font-sans text-body-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface"
              >
                Voltar para o login
              </button>
            )}
          </div>

          {/* Alternar entre entrar / criar conta */}
          {mode !== 'forgot' && (
            <p className="mt-6 text-center font-sans text-body-sm text-white/70">
              {mode === 'signin' ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-label text-on-media-accent transition-opacity hover:opacity-80"
              >
                {mode === 'signin' ? 'Criar conta' : 'Entrar'}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container px-4 py-3.5 transition-colors focus-within:border-primary/70 focus-within:bg-surface-container-high">
      <span className="shrink-0 text-on-surface-variant" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}
