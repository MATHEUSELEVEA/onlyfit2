import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  AppendHealthEventInput,
  HealthConsentPurpose,
  HealthConsentState,
  HealthEvent,
  HealthQuestionnaireVersion,
  QuestionnaireSchema,
} from './types';

const PAGE_SIZE = 30;
const healthEventsKey = ['health-profile', 'events'] as const;
const healthConsentsKey = ['health-profile', 'consents'] as const;
const healthQuestionnaireKey = ['health-profile', 'questionnaire'] as const;

interface HealthEventRow {
  id: string;
  category: HealthEvent['category'];
  event_type: HealthEvent['eventType'];
  title: string;
  narrative: string | null;
  effective_at: string;
  recorded_at: string;
  source_type: HealthEvent['sourceType'];
  capture_method: HealthEvent['captureMethod'];
  questionnaire_version_id: string | null;
  document_id: string | null;
  corrects_event_id: string | null;
  content: Record<string, unknown> | null;
  provenance: Record<string, unknown> | null;
  confirmed_at: string;
}

function mapEvent(row: HealthEventRow): HealthEvent {
  return {
    id: row.id,
    category: row.category,
    eventType: row.event_type,
    title: row.title,
    narrative: row.narrative,
    effectiveAt: row.effective_at,
    recordedAt: row.recorded_at,
    sourceType: row.source_type,
    captureMethod: row.capture_method,
    questionnaireVersionId: row.questionnaire_version_id,
    documentId: row.document_id,
    correctsEventId: row.corrects_event_id,
    content: row.content ?? {},
    provenance: row.provenance ?? {},
    confirmedAt: row.confirmed_at,
  };
}

export function useHealthConsents() {
  return useQuery({
    queryKey: healthConsentsKey,
    queryFn: async (): Promise<HealthConsentState[]> => {
      const { data, error } = await supabase.rpc('get_my_health_consents');
      if (error) throw error;
      return ((data ?? []) as Array<{
        purpose: HealthConsentPurpose;
        action: 'granted' | 'revoked';
        policy_version: string;
        statement: string;
        recorded_at: string;
      }>).map((row) => ({
        purpose: row.purpose,
        action: row.action,
        policyVersion: row.policy_version,
        statement: row.statement,
        recordedAt: row.recorded_at,
      }));
    },
  });
}

export function useRecordHealthConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      purpose,
      action,
      statement,
    }: {
      purpose: HealthConsentPurpose;
      action: 'granted' | 'revoked';
      statement: string;
    }) => {
      const { error } = await supabase.rpc('record_my_health_consent', {
        p_purpose: purpose,
        p_action: action,
        p_policy_version: '2026-07-13.1',
        p_statement: statement,
        p_metadata: { app: 'onlyfit-mobile' },
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthConsentsKey }),
  });
}

export function useHealthEvents(category?: HealthEvent['category'] | 'all') {
  return useInfiniteQuery({
    queryKey: [...healthEventsKey, category ?? 'all'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<HealthEvent[]> => {
      let query = supabase
        .from('health_events')
        .select(
          'id, category, event_type, title, narrative, effective_at, recorded_at, source_type, capture_method, questionnaire_version_id, document_id, corrects_event_id, content, provenance, confirmed_at',
        )
        .order('effective_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (category && category !== 'all') query = query.eq('category', category);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as HealthEventRow[]).map(mapEvent);
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });
}

export function useHealthEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: [...healthEventsKey, 'detail', eventId],
    enabled: Boolean(eventId),
    queryFn: async (): Promise<HealthEvent> => {
      const { data, error } = await supabase
        .from('health_events')
        .select(
          'id, category, event_type, title, narrative, effective_at, recorded_at, source_type, capture_method, questionnaire_version_id, document_id, corrects_event_id, content, provenance, confirmed_at',
        )
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return mapEvent(data as HealthEventRow);
    },
  });
}

export function usePublishedHealthQuestionnaire() {
  return useQuery({
    queryKey: healthQuestionnaireKey,
    queryFn: async (): Promise<HealthQuestionnaireVersion> => {
      const { data: questionnaire, error: questionnaireError } = await supabase
        .from('health_questionnaires')
        .select('id, key, title, description')
        .eq('key', 'onlyfit_adult_health_anamnesis')
        .single();
      if (questionnaireError) throw questionnaireError;

      const { data: version, error: versionError } = await supabase
        .from('health_questionnaire_versions')
        .select('id, questionnaire_id, version, schema_json, review_status')
        .eq('questionnaire_id', questionnaire.id)
        .eq('is_published', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      if (versionError) throw versionError;

      return {
        id: version.id,
        questionnaireId: version.questionnaire_id,
        key: questionnaire.key,
        title: questionnaire.title,
        description: questionnaire.description,
        version: version.version,
        reviewStatus: version.review_status,
        schema: version.schema_json as QuestionnaireSchema,
      };
    },
  });
}

export function useAppendHealthEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AppendHealthEventInput): Promise<string> => {
      const { data, error } = await supabase.rpc('append_my_health_event', {
        p_category: input.category,
        p_event_type: input.eventType,
        p_title: input.title,
        p_narrative: input.narrative ?? null,
        p_effective_at: input.effectiveAt,
        p_capture_method: input.captureMethod,
        p_content: input.content ?? {},
        p_provenance: input.provenance ?? {},
        p_questionnaire_version_id: input.questionnaireVersionId ?? null,
        p_document_id: input.documentId ?? null,
        p_corrects_event_id: input.correctsEventId ?? null,
        p_facts: input.facts ?? [],
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthEventsKey }),
  });
}
