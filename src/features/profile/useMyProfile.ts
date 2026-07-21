import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Fonte única do perfil do próprio usuário. A identidade Membro × Profissional
// é decidida por `is_professional`: false = membro, true = profissional.
//
// Não acrescente campo sensível (cpf_hash, cpf_last4, email, telefone) ao select
// abaixo: eles têm column-level security e o PostgREST recusa a query inteira com
// "permission denied for table profiles", derrubando todo o perfil. Leia-os pelo
// `useSensitiveProfile` (RPC SECURITY DEFINER).
export interface MyProfile {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  countryCode: string | null;
  language: string | null;
  isCreator: boolean;
  isProfessional: boolean;
  isAmbassador: boolean;
  affinitySports: string[];
}

export function myProfileQueryKey(userId: string | undefined) {
  return ['my-profile-summary', userId] as const;
}

// A relação profiles → creator_profiles vem como objeto ou array conforme o
// PostgREST resolve a cardinalidade; normaliza para um único registro.
function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return (value as T) ?? null;
}

export function useMyProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: myProfileQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          `id, username, full_name, avatar_url, bio, country_code, language, is_creator, is_professional, is_ambassador,
           creator_profiles ( sports )`,
        )
        .eq('id', userId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const cp = firstRow<{ sports: string[] | null }>(data.creator_profiles);
      return {
        userId: data.id,
        username: data.username,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        bio: data.bio,
        countryCode: data.country_code,
        language: data.language,
        isCreator: Boolean(data.is_creator),
        isProfessional: Boolean((data as { is_professional?: boolean | null }).is_professional),
        isAmbassador: Boolean((data as { is_ambassador?: boolean | null }).is_ambassador),
        affinitySports: cp?.sports ?? [],
      };
    },
  });
}
