import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { unreadKey } from './keys';

// Total de mensagens recebidas não lidas — alimenta a bolinha vermelha no botão
// "Mensagens" do Perfil. Realtime invalida esta query no INSERT/UPDATE.
export function useUnreadCount() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: unreadKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', userId!)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
