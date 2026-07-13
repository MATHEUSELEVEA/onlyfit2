import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Loader2, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import type { QuestionnaireAnswer, QuestionnaireAnswers, QuestionnaireQuestion, QuestionnaireSection } from './types';
import { useAppendHealthEvent, usePublishedHealthQuestionnaire } from './useHealthProfile';
import { buildQuestionnaireFacts, isQuestionVisible, validateQuestionAnswer } from './questionnaire';

export function HealthQuestionnairePage() {
  const navigate = useNavigate();
  const { data: questionnaire, isLoading, isError, refetch } = usePublishedHealthQuestionnaire();
  const appendEvent = useAppendHealthEvent();
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');

  if (isLoading) {
    return (
      <HealthPageShell width="form">
        <HealthPageHeader title="Anamnese" backTo="/perfil/saude/anamnese" />
        <main className="px-4 py-6"><LoadingRows /></main>
      </HealthPageShell>
    );
  }

  if (isError || !questionnaire) {
    return (
      <HealthPageShell width="form">
        <HealthPageHeader title="Anamnese" backTo="/perfil/saude/anamnese" />
        <main className="px-4 py-6">
          <FeedbackMessage type="error">Não foi possível carregar as perguntas da anamnese.</FeedbackMessage>
          <button type="button" onClick={() => void refetch()} className="mt-4 min-h-11 w-full rounded-full bg-primary px-5 font-sans text-label text-on-primary">
            Tentar novamente
          </button>
        </main>
      </HealthPageShell>
    );
  }

  const activeQuestionnaire = questionnaire;
  const sections = activeQuestionnaire.schema.sections;
  const section = sections[sectionIndex];
  const visibleQuestions = section.questions.filter((question) => isQuestionVisible(question, answers));
  const isLastSection = sectionIndex === sections.length - 1;
  const progress = ((sectionIndex + 1) / sections.length) * 100;

  function updateAnswer(questionId: string, value: QuestionnaireAnswer) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  function validateSection(currentSection: QuestionnaireSection) {
    const nextErrors: Record<string, string> = {};
    for (const question of currentSection.questions.filter((item) => isQuestionVisible(item, answers))) {
      const validationError = validateQuestionAnswer(question, answers[question.id]);
      if (validationError) nextErrors[question.id] = validationError;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function continueFlow() {
    if (!validateSection(section)) return;
    if (!isLastSection) {
      setSectionIndex((current) => current + 1);
      window.requestAnimationFrame(() => document.getElementById('questionnaire-section-title')?.focus());
      return;
    }

    setSaveError('');
    const now = new Date().toISOString();
    try {
      await appendEvent.mutateAsync({
        category: 'anamnesis',
        eventType: 'questionnaire_response',
        title: 'Anamnese de saúde',
        effectiveAt: now,
        captureMethod: 'questionnaire',
        questionnaireVersionId: activeQuestionnaire.id,
        content: {
          questionnaire_key: activeQuestionnaire.key,
          questionnaire_version: activeQuestionnaire.version,
          questionnaire_snapshot: activeQuestionnaire.schema,
          answers,
        },
        provenance: {
          locale: activeQuestionnaire.schema.locale,
          template_review_status: activeQuestionnaire.reviewStatus,
          submitted_via: 'onlyfit-mobile',
        },
        facts: buildQuestionnaireFacts(activeQuestionnaire.schema.sections, answers, now),
      });
      navigate('/perfil/saude', {
        replace: true,
        state: { success: 'Anamnese adicionada ao seu histórico de saúde.' },
      });
    } catch {
      setSaveError('Não foi possível salvar sua anamnese. Suas respostas continuam nesta tela para você tentar novamente.');
    }
  }

  return (
    <HealthPageShell width="form">
      <HealthPageHeader
        title="Anamnese"
        description={`Etapa ${sectionIndex + 1} de ${sections.length}`}
        backTo="/perfil/saude/anamnese"
      />
      <div className="h-1 bg-surface-container" aria-hidden>
        <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      <main className="px-4 py-6">
        {sectionIndex === 0 && activeQuestionnaire.schema.intro ? (
          <FeedbackMessage type="info">{activeQuestionnaire.schema.intro}</FeedbackMessage>
        ) : null}

        <div className={clsx(sectionIndex === 0 && activeQuestionnaire.schema.intro ? 'mt-6' : '')}>
          <h2 id="questionnaire-section-title" tabIndex={-1} className="font-sans text-title text-on-surface focus:outline-none">
            {section.title}
          </h2>
          {section.description ? (
            <p className="mt-1 font-sans text-body text-on-surface-variant">{section.description}</p>
          ) : null}
        </div>

        <div className="mt-6 space-y-6">
          {visibleQuestions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              value={answers[question.id]}
              error={errors[question.id]}
              onChange={(value) => updateAnswer(question.id, value)}
            />
          ))}
        </div>

        {Object.keys(errors).length > 0 ? (
          <div className="mt-5 flex items-start gap-2 font-sans text-body-sm text-error" role="alert">
            <TriangleAlert size={17} className="mt-0.5 shrink-0" aria-hidden />
            Revise as perguntas indicadas antes de continuar.
          </div>
        ) : null}
        {saveError ? <div className="mt-5"><FeedbackMessage type="error">{saveError}</FeedbackMessage></div> : null}

        <div className="mt-8 flex gap-3">
          {sectionIndex > 0 ? (
            <button
              type="button"
              onClick={() => setSectionIndex((current) => current - 1)}
              disabled={appendEvent.isPending}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-4 font-sans text-label text-on-surface disabled:opacity-60"
            >
              <ChevronLeft size={18} aria-hidden /> Voltar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void continueFlow()}
            disabled={appendEvent.isPending}
            className="inline-flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {appendEvent.isPending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : isLastSection ? <Check size={18} aria-hidden /> : null}
            {appendEvent.isPending ? 'Salvando...' : isLastSection ? 'Confirmar e salvar' : 'Continuar'}
            {!appendEvent.isPending && !isLastSection ? <ChevronRight size={18} aria-hidden /> : null}
          </button>
        </div>
      </main>
    </HealthPageShell>
  );
}

function QuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: QuestionnaireQuestion;
  value: QuestionnaireAnswer | undefined;
  error?: string;
  onChange: (value: QuestionnaireAnswer) => void;
}) {
  if (question.type === 'textarea') {
    return (
      <TextAreaField
        id={`health-question-${question.id}`}
        label={question.label}
        hint={question.help}
        error={error}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        maxLength={2000}
        className="min-h-[112px]"
      />
    );
  }

  if (question.type === 'number') {
    return (
      <TextField
        id={`health-question-${question.id}`}
        label={question.label}
        hint={question.help ?? (question.unit ? `Valor em ${question.unit}` : undefined)}
        error={error}
        type="number"
        inputMode="decimal"
        min={question.min}
        max={question.max}
        step={question.step}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    );
  }

  if (question.type === 'boolean_confirmation') {
    return (
      <div>
        <label className={clsx('flex items-start gap-3 rounded-xl border px-3 py-3', error ? 'border-error' : 'border-outline-variant/50')}>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-outline-variant accent-primary"
          />
          <span className="font-sans text-body text-on-surface">{question.label}</span>
        </label>
        {error ? <p className="mt-1.5 font-sans text-body-sm text-error">{error}</p> : null}
      </div>
    );
  }

  const options = question.type === 'boolean'
    ? [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
    : (question.options ?? []);

  return (
    <fieldset>
      <legend className="font-sans text-body-sm font-medium text-on-surface-variant">{question.label}</legend>
      {question.help ? <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{question.help}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const optionValue: QuestionnaireAnswer = question.type === 'boolean' ? option.value === 'true' : option.value;
          const selected = value === optionValue;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(optionValue)}
              className={clsx(
                'min-h-11 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1.5 font-sans text-body-sm text-error">{error}</p> : null}
    </fieldset>
  );
}
