import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { sanitizeSearchTerm } from '@/lib/search';
import { useAuth } from '@/contexts/AuthContext';

export interface UserSuggestion {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
  isProfessional: boolean;
}

interface SuggestionRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  professional_shell_enabled: boolean | null;
}

/** Abaixo disso a busca não roda: 1 letra traz meio banco e não ajuda ninguém. */
export const USER_SEARCH_MIN_LENGTH = 2;

/** Normaliza o que a pessoa digitou: o @ é enfeite, o banco guarda sem ele. */
export function normalizeUserSearchTerm(term: string): string {
  return sanitizeSearchTerm(term).replace(/^@/, '');
}

// Ordena por relevância percebida: quem começa com o termo aparece antes de
// quem só o contém no meio — sem isso "ana" mostra "joana" antes de "ana".
function rank(user: UserSuggestion, term: string): number {
  const username = user.username.toLowerCase();
  const name = user.name.toLowerCase();
  if (username === term) return 0;
  if (username.startsWith(term)) return 1;
  if (name.startsWith(term)) return 2;
  return 3;
}

/**
 * Sugestões de pessoas por nome ou @usuário, para campos que escolhem um
 * usuário (ex.: convite de gestão de negócio). Só perfis com username — sem
 * ele não há como convidar. Exclui o próprio usuário. Busca no SERVIDOR: o
 * campo precisa enxergar todo mundo, não uma amostra pré-carregada.
 *
 * Colunas restritas às públicas de propósito: `profiles` tem column-level
 * security e pedir campo sensível aqui derrubaria a query inteira.
 */
export function useUserSearch(term: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const normalized = normalizeUserSearchTerm(term).toLowerCase();
  const enabled = Boolean(userId) && normalized.length >= USER_SEARCH_MIN_LENGTH;

  return useQuery({
    queryKey: ['user-search', userId, normalized],
    enabled,
    staleTime: 60_000,
    // Mantém a lista anterior enquanto a próxima chega: sem isso a lista pisca
    // a cada letra digitada.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<UserSuggestion[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, professional_shell_enabled')
        .not('username', 'is', null)
        .neq('id', userId!)
        .or(`username.ilike.%${normalized}%,full_name.ilike.%${normalized}%`)
        .limit(12);
      if (error) throw error;

      return ((data ?? []) as SuggestionRow[])
        .filter((row): row is SuggestionRow & { username: string } => Boolean(row.username))
        .map((row) => ({
          id: row.id,
          username: row.username,
          name: row.full_name || row.username,
          avatarUrl: row.avatar_url,
          isProfessional: Boolean(row.professional_shell_enabled),
        }))
        .sort((a, b) => rank(a, normalized) - rank(b, normalized))
        .slice(0, 8);
    },
  });
}
