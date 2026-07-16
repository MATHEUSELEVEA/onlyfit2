import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizeEmail } from '@/lib/auth';
import { publicAppOrigin } from '@/lib/publicUrl';

/**
 * Extrai a mensagem de erro de uma resposta de `supabase.functions.invoke`,
 * seja do corpo de erro HTTP (context.json) ou de um `{ error }` aninhado
 * no próprio payload de sucesso. Compartilhado entre signUp e resetPassword.
 */
async function extractFunctionErrorMessage(
  error: unknown,
  nestedError: string | undefined,
  fallback: string,
): Promise<string | null> {
  if (!error && !nestedError) return null;
  if (error) {
    try {
      const bodyErr = (error as { context?: { json?: () => Promise<{ error?: string }> } })
        ?.context?.json;
      const parsed = bodyErr ? await bodyErr() : {};
      return parsed?.error || (error as Error).message || fallback;
    } catch {
      return (error as Error).message || fallback;
    }
  }
  return nestedError ?? fallback;
}

/** Metadados enviados no cadastro para o trigger de perfil (igual v1). */
export interface SignUpMetadata {
  full_name?: string;
  username?: string;
  country_code?: string;
  tax_id?: string;
  language?: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    metadata?: SignUpMetadata,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signIn: async () => ({ error: 'AuthProvider ausente' }),
  signUp: async () => ({ error: 'AuthProvider ausente', needsConfirmation: false }),
  resetPassword: async () => ({ error: 'AuthProvider ausente' }),
  updatePassword: async () => ({ error: 'AuthProvider ausente' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  /**
   * Domínio do app enviado nas edge functions de e-mail (reset e confirmação),
   * definido no deploy via `.env`. Vazio/ausente => cada edge function usa o
   * seu próprio padrão (o mesmo domínio do v1). A edge valida contra a
   * allowlist antes de usar — nunca confia cegamente na URL do cliente.
   */
  function appBaseUrl(): string | undefined {
    return publicAppOrigin();
  }

  /**
   * Cria a conta via edge function `send-signup-confirmation` (Admin API +
   * Resend) em vez do `supabase.auth.signUp()` nativo. Motivo: o e-mail
   * nativo de confirmação monta o link com `{{ .SiteURL }}`, uma configuração
   * GLOBAL do projeto Supabase (compartilhada com o v1) que nenhuma variável
   * da aplicação alcança. Passando pela Admin API, nenhum e-mail nativo é
   * disparado — nós montamos e enviamos o nosso, com o domínio do app.
   */
  async function signUp(email: string, password: string, metadata?: SignUpMetadata) {
    const normalized = normalizeEmail(email);
    const baseUrl = appBaseUrl();
    const { data, error } = await supabase.functions.invoke('send-signup-confirmation', {
      body: {
        email: normalized,
        password,
        // O trigger `sync_profile_contacts_from_auth_user` popula o perfil
        // a partir destes campos (username, full_name, country_code, language).
        metadata,
        ...(baseUrl ? { base_url: baseUrl } : {}),
      },
    });

    const nested = (data as { error?: string } | null)?.error;
    const msg = await extractFunctionErrorMessage(error, nested, 'Não foi possível criar a conta.');
    if (msg) return { error: msg, needsConfirmation: false };

    // A conta nasce sem sessão — sempre exige confirmação por e-mail.
    return { error: null, needsConfirmation: true };
  }

  /**
   * Envio do link de recuperação via edge function `send-password-reset`
   * (Admin API + Resend), exatamente como o v1 — o método nativo
   * `resetPasswordForEmail` foi abandonado lá por cair em filtro de spam.
   */
  async function resetPassword(email: string) {
    const normalized = normalizeEmail(email);
    const baseUrl = appBaseUrl();
    const { data, error } = await supabase.functions.invoke('send-password-reset', {
      body: { email: normalized, ...(baseUrl ? { base_url: baseUrl } : {}) },
    });

    const nested = (data as { error?: string } | null)?.error;
    const msg = await extractFunctionErrorMessage(error, nested, 'Erro ao enviar e-mail. Tente novamente mais tarde.');
    return { error: msg };
  }

  /** Define a nova senha do usuário na sessão de recuperação ativa. */
  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, loading, signIn, signUp, resetPassword, updatePassword, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
