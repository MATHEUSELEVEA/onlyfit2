import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Cartões tokenizados do usuário. O token vive só no servidor (column-level
// security em payment_cards); o cliente só lê os metadados seguros e escreve
// via edge function (tokenização) ou RPCs SECURITY DEFINER (principal/apelido/
// exclusão). Ver docs de pagamentos no repo onlyfit-supabase.
export interface PaymentCard {
  id: string;
  brand: string | null;
  last4: string;
  holderName: string | null;
  nickname: string | null;
  isDefault: boolean;
  createdAt: string;
}

export function paymentCardsQueryKey(userId: string | undefined) {
  return ['payment-cards', userId] as const;
}

function mapRow(row: {
  id: string;
  brand: string | null;
  last4: string;
  holder_name: string | null;
  nickname: string | null;
  is_default: boolean;
  created_at: string;
}): PaymentCard {
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    holderName: row.holder_name,
    nickname: row.nickname,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

export function usePaymentCards() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: paymentCardsQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<PaymentCard[]> => {
      const { data, error } = await supabase
        .from('payment_cards')
        .select('id, brand, last4, holder_name, nickname, is_default, created_at')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export interface AddCardInput {
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  holderInfo: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    postalCode: string;
    addressNumber: string;
    phone?: string;
  };
  nickname?: string;
}

/** Códigos de erro da edge function → mensagem PT amigável. */
export function mapAddCardError(code: string | undefined): string {
  switch (code) {
    case 'payment_platform_not_configured':
      return 'O pagamento ainda não está ativo na plataforma. Tente novamente mais tarde.';
    case 'invalid_card_number':
      return 'Número do cartão inválido.';
    case 'invalid_expiry':
      return 'Validade do cartão inválida.';
    case 'invalid_ccv':
      return 'Código de segurança (CVV) inválido.';
    case 'invalid_holder_name':
      return 'Informe o nome impresso no cartão.';
    case 'invalid_postal_code':
      return 'CEP inválido.';
    case 'invalid_address_number':
      return 'Informe o número do endereço.';
    case 'invalid_cpf':
    case 'cpf_required':
      return 'Informe um CPF válido do titular.';
    case 'email_required':
      return 'Informe um e-mail para o titular.';
    case 'card_limit_reached':
      return 'Você atingiu o limite de cartões cadastrados.';
    case 'asaas_error':
      return 'O cartão foi recusado pela operadora. Confira os dados.';
    default:
      return 'Não foi possível cadastrar o cartão. Tente novamente.';
  }
}

export function useAddPaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: AddCardInput) => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        message?: string;
      }>('payment-tokenize-card', { body: input });
      if (error) {
        // A edge function devolve o código de erro no corpo mesmo em status !=2xx.
        let code: string | undefined;
        try {
          const context = (error as { context?: Response }).context;
          if (context && typeof context.json === 'function') {
            const body = await context.json();
            code = body?.error;
          }
        } catch {
          code = undefined;
        }
        throw new Error(mapAddCardError(code));
      }
      if (data?.ok !== true) throw new Error(mapAddCardError(data?.error));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useSetDefaultCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('set_default_payment_card', { p_card_id: cardId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useRenamePaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: { cardId: string; nickname: string }) => {
      const { error } = await supabase.rpc('rename_payment_card', {
        p_card_id: input.cardId,
        p_nickname: input.nickname || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}

export function useDeletePaymentCard() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('delete_payment_card', { p_card_id: cardId });
      if (error) {
        if (error.message.includes('default_card_delete_blocked')) {
          throw new Error('Defina outro cartão como principal antes de excluir este.');
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: paymentCardsQueryKey(userId) });
    },
  });
}
