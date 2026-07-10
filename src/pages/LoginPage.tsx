import { useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BackgroundSlideshow } from '@/components/BackgroundSlideshow';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; cta: string }> = {
  signin: {
    title: 'Bem-vindo de volta',
    subtitle: 'Entre para acessar seu feed.',
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

export function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const copy = COPY[mode];

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setSubmitting(false);
    setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();

    if (mode === 'signin') {
      const { error: signInError } = await signIn(trimmedEmail, password);
      if (signInError) setError('Email ou senha inválidos.');
    } else if (mode === 'signup') {
      const { error: signUpError, needsConfirmation } = await signUp(trimmedEmail, password);
      if (signUpError) {
        setError('Não foi possível criar a conta. Tente outro email.');
      } else if (needsConfirmation) {
        setNotice('Conta criada! Confira seu email para confirmar o acesso.');
      }
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
    <div className="relative h-full w-full overflow-hidden">
      <BackgroundSlideshow />

      <div className="relative z-10 flex h-full flex-col overflow-y-auto no-scrollbar px-6 pb-safe-bottom pt-safe-top">
        <div className="animate-login-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-end pb-10 pt-16">
          {/* Marca */}
          <header className="mb-8">
            <h1 className="font-sans text-5xl font-extrabold leading-none tracking-tight text-white">
              Only<span className="text-primary">Fit</span>
            </h1>
            <p className="mt-3 max-w-[16rem] font-sans text-body text-white/70">
              Sua comunidade de alta performance.
            </p>
          </header>

          {/* Card de vidro */}
          <div className="rounded-3xl border border-white/15 bg-white/10 p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <div className="mb-5">
              <h2 className="font-sans text-title-lg text-white">{copy.title}</h2>
              <p className="mt-1 font-sans text-body-sm text-white/60">{copy.subtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <Field icon={<Mail size={18} />} label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-transparent font-sans text-body text-white placeholder:text-white/35 outline-none"
                />
              </Field>

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
                    className="w-full bg-transparent font-sans text-body text-white placeholder:text-white/35 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="ml-2 shrink-0 text-white/50 transition-colors hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </Field>
              )}

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="-mt-1 self-end font-sans text-body-sm font-medium text-white/70 transition-colors hover:text-primary"
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
                disabled={submitting}
                className="mt-2 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary font-sans text-label text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {submitting && <Loader2 size={18} className="animate-spin" aria-hidden />}
                {copy.cta}
              </button>
            </form>

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="mt-4 w-full text-center font-sans text-body-sm font-medium text-white/70 transition-colors hover:text-white"
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
                className="font-semibold text-primary transition-opacity hover:opacity-80"
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
    <label className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/20 px-4 py-3.5 transition-colors focus-within:border-primary/70 focus-within:bg-black/30">
      <span className="shrink-0 text-white/50" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}
