import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export interface UserAddress {
  id: string;
  label: string | null;
  recipientName: string | null;
  line1: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  isDefaultShipping: boolean;
}

function addressesQueryKey(userId: string | undefined) {
  return ['my-addresses', userId] as const;
}

function mapRow(row: {
  id: string;
  label: string | null;
  recipient_name: string | null;
  line1: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  is_default_shipping: boolean;
}): UserAddress {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    line1: row.line1,
    number: row.number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    isDefaultShipping: row.is_default_shipping,
  };
}

export function useAddresses() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: addressesQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<UserAddress[]> => {
      const { data, error } = await supabase
        .from('user_addresses')
        .select(
          'id, label, recipient_name, line1, number, complement, neighborhood, city, state, postal_code, country_code, is_default_shipping',
        )
        .eq('user_id', userId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

// Whitelist explícita: nunca aceita `user_id` ou `is_default_shipping` do
// payload do formulário — o primeiro é sempre injetado a partir da sessão,
// o segundo só muda via RPC set_default_shipping_address (troca atômica).
const addressInputSchema = z
  .object({
    label: z.string().max(60).optional().nullable(),
    recipient_name: z.string().max(120).optional().nullable(),
    line1: z.string().min(1).max(200),
    number: z.string().min(1).max(20),
    complement: z.string().max(100).optional().nullable(),
    neighborhood: z.string().max(100).optional().nullable(),
    city: z.string().min(1).max(100),
    state: z.string().length(2),
    postal_code: z.string().min(3).max(12),
    country_code: z.string().max(5).optional(),
  })
  .strict();

export type AddressInput = z.infer<typeof addressInputSchema>;

export function useCreateAddress() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (input: AddressInput) => {
      if (!userId) throw new Error('Sessão inválida.');
      const validated = addressInputSchema.parse(input);
      const { error } = await supabase.from('user_addresses').insert({ ...validated, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressesQueryKey(userId) });
    },
  });
}

export function useUpdateAddress() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AddressInput }) => {
      const validated = addressInputSchema.parse(input);
      const { error } = await supabase.from('user_addresses').update(validated).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressesQueryKey(userId) });
    },
  });
}

export function useDeleteAddress() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressesQueryKey(userId) });
    },
  });
}

export function useSetDefaultAddress() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  return useMutation({
    mutationFn: async (addressId: string) => {
      const { data, error } = await supabase.rpc('set_default_shipping_address', {
        p_address_id: addressId,
      });
      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Não foi possível definir o endereço padrão.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: addressesQueryKey(userId) });
    },
  });
}
