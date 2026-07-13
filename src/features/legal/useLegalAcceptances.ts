import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { LegalDocument, LegalDocumentKind } from './legalDocuments';

export interface LegalAcceptance {
  id: string;
  documentKey: string;
  version: string;
  acceptedAt: string;
}

interface LegalAcceptanceRow {
  id: string;
  document_key: string;
  version: string;
  accepted_at: string;
}

interface LegalDocumentRow {
  key: string;
  version: string;
  kind: LegalDocumentKind;
  title: string;
  description: string;
  pdf_url: string;
  acceptance_text: string;
  action_label: string;
}

export function legalDocumentsQueryKey() {
  return ['legal-documents'] as const;
}

export function legalAcceptancesQueryKey(userId: string | undefined, documentKeys?: string[]) {
  return ['legal-acceptances', userId, documentKeys?.join('|') ?? ''] as const;
}

function mapRow(row: LegalAcceptanceRow): LegalAcceptance {
  return {
    id: row.id,
    documentKey: row.document_key,
    version: row.version,
    acceptedAt: row.accepted_at,
  };
}

function mapDocumentRow(row: LegalDocumentRow): LegalDocument {
  return {
    key: row.key,
    version: row.version,
    kind: row.kind,
    title: row.title,
    description: row.description,
    pdfPath: row.pdf_url,
    checkboxLabel: row.acceptance_text,
    actionLabel: row.action_label,
  };
}

export function useLegalDocuments() {
  return useQuery({
    queryKey: legalDocumentsQueryKey(),
    queryFn: async (): Promise<LegalDocument[]> => {
      const { data, error } = await supabase
        .from('legal_documents')
        .select('key, version, kind, title, description, pdf_url, acceptance_text, action_label')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as LegalDocumentRow[]).map(mapDocumentRow);
    },
  });
}

export function useLegalAcceptances(documentKeys: string[]) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: legalAcceptancesQueryKey(userId, documentKeys),
    enabled: Boolean(userId && documentKeys.length > 0),
    queryFn: async (): Promise<LegalAcceptance[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_legal_acceptances')
        .select('id, document_key, version, accepted_at')
        .eq('user_id', userId)
        .in('document_key', documentKeys)
        .order('accepted_at', { ascending: false });

      if (error) throw error;
      return ((data ?? []) as LegalAcceptanceRow[]).map(mapRow);
    },
  });
}

export function useAcceptLegalDocument() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (document: LegalDocument) => {
      if (!userId) throw new Error('Sessão inválida.');

      const { data, error } = await supabase.rpc('accept_legal_document', {
        p_document_key: document.key,
        p_version: document.version,
        p_user_agent: window.navigator.userAgent,
      });

      if (error) throw error;
      const result = data as { ok: boolean; error?: string };
      if (!result?.ok) throw new Error(result?.error ?? 'Não foi possível registrar o aceite.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-acceptances', userId] });
    },
  });
}
