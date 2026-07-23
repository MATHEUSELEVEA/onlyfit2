import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Janela de arrependimento para estorno de compra única (espelha payment-refund).
export const REFUND_WINDOW_DAYS = 7;

export function isWithinRefundWindow(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return Date.now() - created <= REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await supabase.functions.invoke('subscription-cancel', {
        body: { subscription_id: subscriptionId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'cancel_failed');
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-transactions'] });
    },
  });
}

export function useRefundTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await supabase.functions.invoke('payment-refund', {
        body: { transaction_id: transactionId },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error ?? 'refund_failed');
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-transactions'] });
    },
  });
}
