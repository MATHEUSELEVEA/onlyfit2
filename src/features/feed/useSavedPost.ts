import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Posts salvos ficam locais por usuário (localStorage), como no onlyfit v1 —
// não existe tabela de salvos no banco ainda. Quando existir, este hook vira
// uma mutação Supabase sem mudar a interface.
function readSavedIds(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function useSavedPost(postId: string): { saved: boolean; toggleSaved: () => void } {
  const { session } = useAuth();
  const userId = session?.user.id;
  const storageKey = `onlyfit.saved-posts.${userId ?? 'anon'}`;

  const [saved, setSaved] = useState(() => readSavedIds(storageKey).includes(postId));

  const toggleSaved = useCallback(() => {
    setSaved((wasSaved) => {
      const ids = new Set(readSavedIds(storageKey));
      if (wasSaved) {
        ids.delete(postId);
        if (userId) {
          void supabase
            .from('feed_post_events')
            .delete()
            .eq('user_id', userId)
            .eq('post_id', postId)
            .eq('event_type', 'save');
        }
      } else {
        ids.add(postId);
        if (userId) {
          void supabase.from('feed_post_events').insert({
            user_id: userId,
            post_id: postId,
            event_type: 'save',
          });
        }
      }
      try {
        localStorage.setItem(storageKey, JSON.stringify([...ids]));
      } catch {
        // Sem storage disponível (modo privado): mantém só o estado da sessão.
      }
      return !wasSaved;
    });
  }, [postId, storageKey, userId]);

  return { saved, toggleSaved };
}
