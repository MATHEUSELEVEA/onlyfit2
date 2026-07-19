import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Catálogo vem do banco (offering_types): criar um novo tipo de oferta na
// plataforma é um INSERT lá, sem mudança de código aqui.
export interface OfferingType {
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  billing_type: 'one_time' | 'recurring' | 'free';
  billing_interval: 'month' | '2month' | 'quarter' | 'semester' | 'year' | null;
  max_per_business: number | null;
  unique_per_owner_profile: boolean;
  requires_affinity_group: boolean;
  requires_product_category: boolean;
  sort_order: number;
}

export type OfferingStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface BusinessOffering {
  id: string;
  organization_id: string;
  offering_type: string;
  name: string;
  description: string | null;
  status: OfferingStatus;
  billing_type: 'one_time' | 'recurring' | 'free';
  billing_interval: 'month' | '2month' | 'quarter' | 'semester' | 'year' | null;
  created_at: string;
}

export function useOfferingTypes() {
  return useQuery({
    queryKey: ['offering-types'] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OfferingType[]> => {
      const { data, error } = await supabase
        .from('offering_types')
        .select(
          'slug,name,description,icon,billing_type,billing_interval,max_per_business,unique_per_owner_profile,requires_affinity_group,requires_product_category,sort_order',
        )
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OfferingType[];
    },
  });
}

export function useBusinessOfferings(businessId: string | undefined) {
  return useQuery({
    queryKey: ['business-offerings', businessId] as const,
    enabled: Boolean(businessId),
    queryFn: async (): Promise<BusinessOffering[]> => {
      const { data, error } = await supabase
        .from('business_offerings')
        .select('id,organization_id,offering_type,name,description,status,billing_type,billing_interval,created_at')
        .eq('organization_id', businessId!)
        .neq('status', 'archived')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BusinessOffering[];
    },
  });
}

// Leitura de uma oferta isolada para a tela de gerenciamento. Diferente da
// lista, NÃO filtra 'archived': a página precisa abrir mesmo uma oferta
// arquivada (ex. link direto) para mostrar o estado atual.
export function useBusinessOffering(businessId: string | undefined, offeringId: string | undefined) {
  return useQuery({
    queryKey: ['business-offering', businessId, offeringId] as const,
    enabled: Boolean(businessId && offeringId),
    queryFn: async (): Promise<BusinessOffering | null> => {
      const { data, error } = await supabase
        .from('business_offerings')
        .select('id,organization_id,offering_type,name,description,status,billing_type,billing_interval,created_at')
        .eq('id', offeringId!)
        .eq('organization_id', businessId!)
        .maybeSingle();
      if (error) throw error;
      return (data as BusinessOffering | null) ?? null;
    },
  });
}

export function useCreateOffering(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { offeringType: string; name: string; description: string }) => {
      const { error } = await supabase.rpc('create_business_offering', {
        p_organization_id: businessId,
        p_offering_type: input.offeringType,
        p_name: input.name,
        p_description: input.description || null,
      });
      // Erro do PostgREST é objeto plain: sem re-throw como Error, o chamador
      // não consegue mapear o código para mensagem amigável.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-offerings', businessId] });
    },
  });
}

export function useUpdateOffering(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      offeringId: string;
      name?: string;
      description?: string;
      status?: OfferingStatus;
    }) => {
      const { error } = await supabase.rpc('update_business_offering', {
        p_offering_id: input.offeringId,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_status: input.status ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['business-offerings', businessId] });
      // A tela de gerenciamento lê a oferta isolada; sem invalidar aqui, ela
      // continuaria mostrando o status/nome antigos após salvar.
      void queryClient.invalidateQueries({ queryKey: ['business-offering', businessId, variables.offeringId] });
    },
  });
}
