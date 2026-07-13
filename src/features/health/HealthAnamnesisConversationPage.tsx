import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Loader2, Send, UserRound } from 'lucide-react';
import { clsx } from 'clsx';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { interpretAnamnesisAnswer } from './healthCaptureApi';
import { answerLabel, buildQuestionnaireFacts, parseObjectiveAnswer, visibleQuestionList } from './questionnaire';
import type { QuestionnaireAnswer, QuestionnaireAnswers, QuestionnaireQuestion } from './types';
import { useAppendHealthEvent, usePublishedHealthQuestionnaire } from './useHealthProfile';

export function HealthAnamnesisConversationPage() {
  const navigate = useNavigate();
  const { data: questionnaire, isLoading, isError } = usePublishedHealthQuestionnaire();
  const appendEvent = useAppendHealthEvent();
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [input, setInput] = useState('');
  const [clarification, setClarification] = useState('');
  const [error, setError] = useState('');
  const [interpreting, setInterpreting] = useState(false);

  const visibleQuestions = useMemo(
    () => questionnaire ? visibleQuestionList(questionnaire.schema.sections, answers) : [],
    [answers, questionnaire],
  );
  const activeQuestion = visibleQuestions.find((question) => answers[question.id] == null);
  const complete = Boolean(questionnaire && !activeQuestion);

  if (isLoading) {
    return <HealthPageShell width="form"><HealthPageHeader title="Conversa assistida" backTo="/perfil/saude/anamnese" /><main className="px-4 py-6"><LoadingRows /></main></HealthPageShell>;
  }
  if (isError || !questionnaire) {
    return <HealthPageShell width="form"><HealthPageHeader title="Conversa assistida" backTo="/perfil/saude/anamnese" /><main className="px-4 py-6"><FeedbackMessage type="error">Não foi possível carregar a anamnese.</FeedbackMessage></main></HealthPageShell>;
  }

  function acceptAnswer(question: QuestionnaireQuestion, value: QuestionnaireAnswer) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setInput('');
    setClarification('');
    setError('');
  }

  async function submitResponse() {
    if (!activeQuestion) return;
    const raw = input.trim();
    if (!raw) {
      setError('Digite ou selecione uma resposta.');
      return;
    }
    const deterministic = parseObjectiveAnswer(activeQuestion, raw);
    if (deterministic !== undefined) {
      acceptAnswer(activeQuestion, deterministic);
      return;
    }
    if (activeQuestion.type === 'textarea') {
      acceptAnswer(activeQuestion, raw);
      return;
    }
    setInterpreting(true);
    setError('');
    try {
      const result = await interpretAnamnesisAnswer(activeQuestion, raw);
      if (result?.understood && result.value != null) acceptAnswer(activeQuestion, result.value);
      else setClarification(result?.clarification || 'Pode responder de outra forma?');
    } catch {
      setError('Não consegui interpretar. Escolha uma das opções ou habilite a assistência por IA no Perfil de Saúde.');
    } finally {
      setInterpreting(false);
    }
  }

  async function confirm() {
    if (!questionnaire) return;
    const requiredMissing = visibleQuestions.some((question) => question.required && answers[question.id] == null);
    if (requiredMissing) {
      setError('Ainda existe uma resposta obrigatória pendente.');
      return;
    }
    const now = new Date().toISOString();
    setError('');
    try {
      await appendEvent.mutateAsync({
        category: 'anamnesis', eventType: 'questionnaire_response', title: 'Anamnese de saúde', effectiveAt: now,
        captureMethod: 'ai_conversation', questionnaireVersionId: questionnaire.id,
        content: {
          questionnaire_key: questionnaire.key, questionnaire_version: questionnaire.version,
          questionnaire_snapshot: questionnaire.schema, answers,
        },
        provenance: {
          locale: questionnaire.schema.locale, template_review_status: questionnaire.reviewStatus,
          submitted_via: 'onlyfit-mobile', conversation_mode: 'deterministic_first',
        },
        facts: buildQuestionnaireFacts(questionnaire.schema.sections, answers, now),
      });
      navigate('/perfil/saude', { replace: true, state: { success: 'Anamnese adicionada ao seu histórico de saúde.' } });
    } catch {
      setError('Não foi possível salvar. Suas respostas continuam nesta tela.');
    }
  }

  const answeredCount = visibleQuestions.filter((question) => answers[question.id] != null).length;
  const progress = visibleQuestions.length ? Math.round((answeredCount / visibleQuestions.length) * 100) : 0;

  return (
    <HealthPageShell width="form">
      <HealthPageHeader title="Conversa assistida" description={`${answeredCount} de ${visibleQuestions.length} respostas`} backTo="/perfil/saude/anamnese" />
      <div className="h-1 bg-surface-container" aria-hidden><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
      <main className="space-y-5 px-4 py-6">
        {complete ? (
          <ReviewConversation
            questions={visibleQuestions}
            answers={answers}
            onEdit={(questionId) => setAnswers((current) => {
              const next = { ...current };
              delete next[questionId];
              return next;
            })}
          />
        ) : activeQuestion ? (
          <section className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container"><Bot size={18} aria-hidden /></span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface-container px-4 py-3">
                <p className="font-sans text-body text-on-surface">{clarification || activeQuestion.label}</p>
                {activeQuestion.help ? <p className="mt-1 font-sans text-body-sm text-on-surface-variant">{activeQuestion.help}</p> : null}
              </div>
            </div>
            <QuickAnswers question={activeQuestion} onAnswer={(value) => acceptAnswer(activeQuestion, value)} />
            {!activeQuestion.required ? (
              <button type="button" onClick={() => acceptAnswer(activeQuestion, '')} className="inline-flex min-h-11 items-center font-sans text-label text-on-surface-variant underline-offset-4 hover:underline">Prefiro não responder</button>
            ) : null}
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Sua resposta</span>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitResponse(); }
                  }}
                  maxLength={1000}
                  rows={2}
                  placeholder="Responda com suas palavras"
                  className="min-h-12 w-full resize-none rounded-2xl border border-outline-variant/50 bg-surface-container-low px-4 py-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <button type="button" onClick={() => void submitResponse()} disabled={interpreting} aria-label="Enviar resposta" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-60">
                {interpreting ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />}
              </button>
            </div>
          </section>
        ) : null}

        {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
        {complete ? (
          <button type="button" onClick={() => void confirm()} disabled={appendEvent.isPending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
            {appendEvent.isPending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Check size={18} aria-hidden />}
            {appendEvent.isPending ? 'Salvando...' : 'Confirmar e salvar'}
          </button>
        ) : null}
      </main>
    </HealthPageShell>
  );
}

function QuickAnswers({ question, onAnswer }: { question: QuestionnaireQuestion; onAnswer: (value: QuestionnaireAnswer) => void }) {
  const options = question.type === 'boolean'
    ? [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }]
    : question.type === 'boolean_confirmation'
      ? [{ value: true, label: 'Confirmo' }]
      : question.type === 'single_choice'
        ? (question.options ?? []).map((option) => ({ value: option.value, label: option.label }))
        : [];
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pl-12">
      {options.map((option) => (
        <button key={String(option.value)} type="button" onClick={() => onAnswer(option.value)} className="min-h-11 rounded-full bg-surface-container px-4 font-sans text-label text-on-surface transition-colors active:bg-primary active:text-on-primary">
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReviewConversation({ questions, answers, onEdit }: { questions: QuestionnaireQuestion[]; answers: QuestionnaireAnswers; onEdit: (questionId: string) => void }) {
  return (
    <section>
      <div className="flex items-start gap-3 rounded-2xl bg-primary-container px-4 py-4 text-on-primary-container">
        <UserRound size={20} className="mt-0.5 shrink-0" aria-hidden />
        <div><h2 className="font-sans text-title">Revise suas respostas</h2><p className="mt-1 font-sans text-body-sm">Nada será adicionado ao histórico antes da confirmação.</p></div>
      </div>
      <div className="mt-4 divide-y divide-outline-variant/25 rounded-2xl border border-outline-variant/40 bg-surface">
        {questions.filter((question) => answers[question.id] != null).map((question) => (
          <button key={question.id} type="button" onClick={() => onEdit(question.id)} className="w-full px-4 py-3 text-left">
            <span className="block font-sans text-body-sm text-on-surface-variant">{question.label}</span>
            <span className={clsx('mt-1 block font-sans text-body font-medium text-on-surface')}>{answerLabel(question, answers[question.id])}</span>
            <span className="mt-1 block font-sans text-label text-primary">Alterar</span>
          </button>
        ))}
      </div>
    </section>
  );
}
