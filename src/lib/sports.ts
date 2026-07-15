// Grupos de afinidade do app. A fonte da verdade é a tabela
// `public.feed_affinity_groups` no Supabase: criar, renomear, reordenar ou
// desativar um grupo é mudança de dado, não de código — não devolva a lista
// para cá nem "só como fallback".
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AffinityGroup {
  key: string;
  label: string;
  /** Sinônimos aceitos ao normalizar texto livre (mesma lista que o banco usa). */
  aliases: string[];
  /** Nome do ícone lucide-react. */
  icon: string;
  /** Classe Tailwind do gradiente de capa. */
  accent: string;
}

const CACHE_KEY = 'onlyfit_affinity_groups';

// A taxonomia muda raramente, mas o app não pode abrir sem rótulo. O cache local
// só adianta o primeiro paint; o banco continua sendo quem manda.
function readCache(): AffinityGroup[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AffinityGroup[]) : [];
  } catch {
    return [];
  }
}

function writeCache(groups: AffinityGroup[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(groups));
  } catch {
    /* storage cheio ou bloqueado: seguir sem cache */
  }
}

async function fetchAffinityGroups(): Promise<AffinityGroup[]> {
  const { data, error } = await supabase
    .from('feed_affinity_groups')
    .select('key, label, aliases, icon, accent')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;

  const groups: AffinityGroup[] = (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    aliases: row.aliases ?? [],
    icon: row.icon ?? 'Sparkles',
    accent: row.accent ?? 'from-primary/20',
  }));
  writeCache(groups);
  return groups;
}

export const AFFINITY_GROUPS_QUERY_KEY = ['affinity-groups'] as const;

export function useAffinityGroupsQuery(): UseQueryResult<AffinityGroup[]> {
  return useQuery({
    queryKey: AFFINITY_GROUPS_QUERY_KEY,
    queryFn: fetchAffinityGroups,
    staleTime: 30 * 60 * 1000,
    placeholderData: readCache,
  });
}

/**
 * Grupos de afinidade + o rótulo de uma chave. `labelFor` é estável para uso em
 * `.map()`: enquanto a taxonomia carrega, devolve a chave humanizada em vez de
 * sumir com o texto.
 */
export function useAffinityGroups() {
  const { data, isLoading } = useAffinityGroupsQuery();
  const groups = data ?? [];
  const labels = new Map(groups.map((group) => [group.key, group.label]));
  const labelFor = (key: string) => labels.get(key) ?? humanizeSportKey(key);
  return { groups, labelFor, isLoading };
}

/** Espelha `public.affinity_slug`: minúsculo, sem acento, só alfanumérico. */
export function affinitySlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function humanizeSportKey(key: string): string {
  const clean = key.replace(/[_-]+/g, ' ').trim();
  if (!clean) return key;
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
