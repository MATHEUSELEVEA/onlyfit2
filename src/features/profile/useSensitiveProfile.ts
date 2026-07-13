import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { normalizeCpf } from '@/lib/cpf';

// Campos sensíveis (email, telefone, CPF) têm column-level security em
// `profiles` — só são lidos pelo próprio usuário via esta RPC SECURITY DEFINER
// (mesmo padrão usado pelo onlyfit-desktop em Config.tsx).
export interface SensitiveProfile {
  phone: string | null;
  cpfCnpj: string | null;
  taxId: string | null;
  cpfLast4: string | null;
}

function sensitiveProfileQueryKey(userId: string | undefined) {
  return ['my-sensitive-profile', userId] as const;
}

export function useSensitiveProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: sensitiveProfileQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<SensitiveProfile> => {
      const { data, error } = await supabase.rpc('get_my_sensitive_profile');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      return {
        phone: (row?.phone as string | null) ?? null,
        cpfCnpj: (row?.cpf_cnpj as string | null) ?? null,
        taxId: (row?.tax_id as string | null) ?? null,
        cpfLast4: (row?.cpf_last4 as string | null) ?? null,
      };
    },
  });
}

/** true quando o CPF já foi cadastrado e trava reedição (trigger no banco). */
export function isCpfConfigured(profile: SensitiveProfile | undefined): boolean {
  if (!profile) return false;
  return (
    normalizeCpf(profile.taxId).length === 11 ||
    normalizeCpf(profile.cpfCnpj).length === 11 ||
    normalizeCpf(profile.cpfLast4).length === 4
  );
}

export function useSetCpf() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (cpfDigits: string) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'set-cpf-hash',
        { body: { cpf: cpfDigits } },
      );
      if (error) throw error;
      if (data?.ok !== true) {
        throw new Error(mapCpfEdgeError(data?.error));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sensitiveProfileQueryKey(userId) });
    },
  });
}

function mapCpfEdgeError(code: string | undefined): string {
  switch (code) {
    case 'invalid_cpf_hash':
    case 'invalid_tax_id':
      return 'CPF inválido. Confira os números digitados.';
    case 'cpf_locked':
      return 'Este CPF já foi cadastrado e não pode ser alterado.';
    case 'cpf_already_claimed':
      return 'Este CPF já está cadastrado em outra conta.';
    default:
      return 'Não foi possível cadastrar o CPF. Tente novamente.';
  }
}
