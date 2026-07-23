import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export class OfferingCheckoutError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || code);
    this.name = 'OfferingCheckoutError';
    this.code = code;
  }
}

export function useOfferingCheckout() {
  return useMutation({
    mutationFn: async (input: { offeringId: string; billingType: 'one_time' | 'recurring'; cardId?: string }) => {
      const functionName = input.billingType === 'recurring' ? 'checkout-offering-subscription' : 'checkout-offering-one-time';
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: {
          offering_id: input.offeringId,
          ...(input.cardId ? { card_id: input.cardId } : {}),
          request_key: crypto.randomUUID(),
        },
      });
      if (error) {
        let code = 'checkout_failed';
        let message = error.message;
        try {
          const context = (error as { context?: Response }).context;
          if (context && typeof context.json === 'function') {
            const body = await context.json();
            if (typeof body?.error === 'string') code = body.error;
            if (typeof body?.message === 'string') message = body.message;
          }
        } catch {
          code = 'checkout_failed';
        }
        throw new OfferingCheckoutError(code, message);
      }
      if (!data?.ok) throw new OfferingCheckoutError(data?.error ?? 'checkout_failed');
      return data as Record<string, unknown>;
    },
  });
}
