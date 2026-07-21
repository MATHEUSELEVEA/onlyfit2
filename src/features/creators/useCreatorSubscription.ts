import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Estado de assinatura do usuário com um creator (payments v2).
// Somente leitura: assinar passa por checkout/pagamento, nunca por escrita
// direta do cliente nessas tabelas.
export function useCreatorSubscription(creatorId: string | null | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['creator-subscription', creatorId, userId],
    enabled: Boolean(creatorId && userId),
    queryFn: async (): Promise<boolean> => {
      const [paymentSubsResp, legacyResp] = await Promise.all([
        supabase
          .from('payment_subscriptions')
          .select('id')
          .eq('professional_profile_id', creatorId!)
          .eq('profile_id', userId!)
          .in('status', ['active', 'past_due'])
          .limit(1)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('creator_id')
          .eq('creator_id', creatorId!)
          .eq('subscriber_id', userId!)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (paymentSubsResp.error) throw paymentSubsResp.error;
      return Boolean(paymentSubsResp.data) || Boolean(legacyResp.data);
    },
  });
}
