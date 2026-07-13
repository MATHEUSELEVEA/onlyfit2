import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClipboardList, ExternalLink, FileText, LockKeyhole, PencilLine, RefreshCw } from 'lucide-react';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { healthCategoryLabels, type HealthFactInput, type QuestionnaireAnswer, type QuestionnaireSchema } from './types';
import { useHealthEvent } from './useHealthProfile';
import { getHealthDocumentUrl } from './healthCaptureApi';

export function HealthEventDetailPage() {
  const { eventId } = useParams();
  const { data: event, isLoading, isError, refetch } = useHealthEvent(eventId);
  const [documentError, setDocumentError] = useState('');

  async function openDocument(documentId: string) {
    const viewer = window.open('', '_blank');
    if (viewer) viewer.opener = null;
    setDocumentError('');
    try {
      const url = await getHealthDocumentUrl(documentId);
      if (viewer) viewer.location.href = url;
      else window.location.href = url;
    } catch {
      viewer?.close();
      setDocumentError('Não foi possível abrir o PDF agora.');
    }
  }

  return (
    <HealthPageShell width="form">
      <HealthPageHeader title="Detalhes do registro" backTo="/perfil/saude" />
      <main className="space-y-6 px-4 py-6">
        {isLoading ? <LoadingRows /> : null}
        {isError ? (
          <>
            <FeedbackMessage type="error">Não foi possível abrir este registro.</FeedbackMessage>
            <button type="button" onClick={() => void refetch()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary">
              <RefreshCw size={17} aria-hidden /> Tentar novamente
            </button>
          </>
        ) : null}
        {event ? (
          <>
            <section>
              <div className="flex items-center gap-2 font-sans text-body-sm text-on-surface-variant">
                {event.eventType === 'questionnaire_response' ? <ClipboardList size={17} aria-hidden /> : <FileText size={17} aria-hidden />}
                {healthCategoryLabels[event.category]}
              </div>
              <h1 className="mt-2 font-sans text-title-lg text-on-surface">{event.title}</h1>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                Informação de {formatDate(event.effectiveAt)} · registrada em {formatDateTime(event.recordedAt)}
              </p>
              {event.narrative ? (
                <p className="mt-5 whitespace-pre-wrap font-sans text-body text-on-surface">{event.narrative}</p>
              ) : null}
            </section>

            {event.eventType === 'questionnaire_response' ? <QuestionnaireAnswers content={event.content} /> : null}
            {event.eventType === 'document_record' ? <DocumentFacts content={event.content} /> : null}

            {event.documentId ? (
              <section>
                <button
                  type="button"
                  onClick={() => void openDocument(event.documentId!)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-5 font-sans text-label text-on-surface"
                >
                  <ExternalLink size={17} aria-hidden /> Abrir PDF original
                </button>
                {documentError ? <div className="mt-3"><FeedbackMessage type="error">{documentError}</FeedbackMessage></div> : null}
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-surface-container-low px-3 py-3">
                <LockKeyhole size={18} className="mt-0.5 shrink-0 text-on-surface-variant" aria-hidden />
                <div>
                  <h2 className="font-sans text-body font-semibold text-on-surface">Registro imutável</h2>
                  <p className="mt-1 font-sans text-body-sm text-on-surface-variant">
                    Para atualizar esta informação, adicione uma correção. O conteúdo anterior continuará preservado.
                  </p>
                </div>
              </div>
              <Link to={`/perfil/saude/novo?corrige=${event.id}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-outline-variant/50 px-5 font-sans text-label text-on-surface">
                <PencilLine size={17} aria-hidden /> Corrigir informação
              </Link>
            </section>
          </>
        ) : null}
      </main>
    </HealthPageShell>
  );
}

function DocumentFacts({ content }: { content: Record<string, unknown> }) {
  const facts = Array.isArray(content.extracted_facts) ? content.extracted_facts as HealthFactInput[] : [];
  if (!facts.length) return null;
  return (
    <section className="border-t border-outline-variant/25 pt-5">
      <h2 className="font-sans text-title text-on-surface">Resultados confirmados</h2>
      <dl className="mt-2 divide-y divide-outline-variant/25">
        {facts.map((fact, index) => (
          <div key={`${fact.canonical_key ?? fact.display}-${index}`} className="py-3">
            <dt className="font-sans text-body-sm text-on-surface-variant">{fact.display}</dt>
            <dd className="mt-1 font-sans text-body text-on-surface">
              {fact.value_numeric ?? fact.value_text ?? fact.value_boolean?.toString()} {fact.unit ?? ''}
              {fact.reference_text ? <span className="block text-body-sm text-on-surface-variant">Referência: {fact.reference_text}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function QuestionnaireAnswers({ content }: { content: Record<string, unknown> }) {
  const schema = content.questionnaire_snapshot as QuestionnaireSchema | undefined;
  const answers = content.answers as Record<string, QuestionnaireAnswer> | undefined;
  if (!schema || !answers) return null;

  return (
    <section className="space-y-5 border-t border-outline-variant/25 pt-5">
      <h2 className="font-sans text-title text-on-surface">Perguntas e respostas</h2>
      {schema.sections.map((section) => {
        const answered = section.questions.filter((question) => answers[question.id] != null && answers[question.id] !== '');
        if (!answered.length) return null;
        return (
          <div key={section.id}>
            <h3 className="font-sans text-body font-semibold text-on-surface">{section.title}</h3>
            <dl className="mt-2 divide-y divide-outline-variant/25">
              {answered.map((question) => (
                <div key={question.id} className="py-3">
                  <dt className="font-sans text-body-sm text-on-surface-variant">{question.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap font-sans text-body text-on-surface">
                    {answerLabel(question.options, answers[question.id])}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function answerLabel(options: { value: string; label: string }[] | undefined, answer: QuestionnaireAnswer) {
  if (typeof answer === 'boolean') return answer ? 'Sim' : 'Não';
  if (typeof answer === 'number') return String(answer);
  return options?.find((option) => option.value === answer)?.label ?? answer;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
