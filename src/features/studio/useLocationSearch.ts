import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PostLocation } from './media';

export interface PlaceResult extends PostLocation {
  secondary: string;
}

// Busca de localização com debounce, via edge places-search (OpenStreetMap).
// A chave/política do provedor fica no servidor; aqui só consumimos.
export function useLocationSearch(query: string) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    // Todo setState roda dentro do callback do timer (após um gap assíncrono),
    // nunca síncrono no corpo do efeito — evita renders em cascata.
    const timer = window.setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        const { data } = await supabase.functions.invoke<{ results: PlaceResult[] }>('places-search', { body: { q } });
        if (!cancelled) setResults(data?.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q.length < 2 ? 0 : 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, loading };
}
