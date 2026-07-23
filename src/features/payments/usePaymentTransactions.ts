import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export type PaymentTransaction = {
  id: string;
  offering_id: string;
  subscription_id: string | null;
  billing_type: 'one_time' | 'recurring';
  gross_value: number;
  net_value: number | null;
  status: string;
  settlement_status: string;
  created_at: string;
  credit_date: string | null;
};

export function usePaymentTransactions() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['payment-transactions', userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<PaymentTransaction[]> => {
      const { data, error } = await supabase.rpc('list_my_payment_transactions', {
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as PaymentTransaction[];
    },
  });
}
