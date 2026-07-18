export type HealthCategory =
  | 'anamnesis'
  | 'condition'
  | 'procedure'
  | 'injury'
  | 'exam'
  | 'medication'
  | 'allergy'
  | 'vaccine'
  | 'symptom'
  | 'physical_assessment'
  | 'habit'
  | 'other';

export type HealthCaptureMethod =
  | 'questionnaire'
  | 'ai_conversation'
  | 'text'
  | 'audio_transcript'
  | 'pdf'
  | 'photo';

export type HealthEventType =
  | 'questionnaire_response'
  | 'clinical_record'
  | 'exam_result'
  | 'document_record'
  | 'correction';

export type HealthConsentPurpose =
  | 'profile_storage'
  | 'ai_assistance'
  | 'professional_sharing'
  | 'analytics_matching';

export interface HealthConsentState {
  purpose: HealthConsentPurpose;
  action: 'granted' | 'revoked';
  policyVersion: string;
  statement: string;
  recordedAt: string;
}

export interface HealthEvent {
  id: string;
  category: HealthCategory;
  eventType: HealthEventType;
  title: string;
  narrative: string | null;
  effectiveAt: string;
  recordedAt: string;
  sourceType: 'self' | 'document' | 'professional';
  captureMethod: HealthCaptureMethod;
  questionnaireVersionId: string | null;
  documentId: string | null;
  correctsEventId: string | null;
  content: Record<string, unknown>;
  provenance: Record<string, unknown>;
  confirmedAt: string;
}

export interface QuestionnaireOption {
  value: string;
  label: string;
}

export interface QuestionnaireFactMapping {
  fact_type: string;
  canonical_key: string;
  display: string;
  unit?: string;
}

export type QuestionnaireQuestionType =
  | 'boolean'
  | 'boolean_confirmation'
  | 'single_choice'
  | 'textarea'
  | 'number';

export interface QuestionnaireQuestion {
  id: string;
  type: QuestionnaireQuestionType;
  label: string;
  help?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: QuestionnaireOption[];
  visible_when?: { any_true?: string[] };
  fact?: QuestionnaireFactMapping;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description?: string;
  questions: QuestionnaireQuestion[];
}

export interface QuestionnaireSchema {
  schema_version: number;
  locale: string;
  estimated_minutes?: number;
  intro?: string;
  sections: QuestionnaireSection[];
}

export interface HealthQuestionnaireVersion {
  id: string;
  questionnaireId: string;
  key: string;
  title: string;
  description: string | null;
  version: number;
  reviewStatus: 'draft' | 'clinically_reviewed';
  schema: QuestionnaireSchema;
}

export type QuestionnaireAnswer = string | number | boolean;
export type QuestionnaireAnswers = Record<string, QuestionnaireAnswer>;

export interface HealthFactInput {
  fact_type: string;
  canonical_key?: string;
  code_system?: string;
  code?: string;
  display: string;
  value_text?: string;
  value_numeric?: number;
  value_boolean?: boolean;
  value_date?: string;
  unit?: string;
  reference_low?: number;
  reference_high?: number;
  reference_text?: string;
  interpretation?: string;
  confidence?: number;
  effective_at?: string;
  metadata?: Record<string, unknown>;
}

export interface AppendHealthEventInput {
  category: HealthCategory;
  eventType: HealthEventType;
  title: string;
  narrative?: string | null;
  effectiveAt: string;
  captureMethod: HealthCaptureMethod;
  content?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
  questionnaireVersionId?: string | null;
  documentId?: string | null;
  correctsEventId?: string | null;
  facts?: HealthFactInput[];
}

export const healthCategoryLabels: Record<HealthCategory, string> = {
  anamnesis: 'Anamnese',
  condition: 'Condição ou diagnóstico',
  procedure: 'Consulta, cirurgia ou procedimento',
  injury: 'Lesão',
  exam: 'Exame ou laudo',
  medication: 'Medicamento',
  allergy: 'Alergia ou intolerância',
  vaccine: 'Vacina',
  symptom: 'Sintoma',
  physical_assessment: 'Avaliação corporal',
  habit: 'Hábito',
  other: 'Outro',
};

const recordCategoryOrder: HealthCategory[] = [
  'habit',
  'physical_assessment',
  'exam',
  'condition',
  'symptom',
  'medication',
  'injury',
  'allergy',
  'procedure',
  'vaccine',
  'other',
];

export const defaultRecordCategory = recordCategoryOrder[0] ?? 'habit';

export const recordCategoryOptions = recordCategoryOrder.map((value) => ({
  value,
  label: healthCategoryLabels[value],
}));
