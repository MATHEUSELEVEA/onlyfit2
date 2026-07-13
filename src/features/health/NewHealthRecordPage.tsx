import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, FileCheck2, FileText, Loader2, Mic, Paperclip, Square, Trash2, Upload } from 'lucide-react';
import { clsx } from 'clsx';
import { SelectField, TextAreaField, TextField } from '@/components/ui/TextField';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { transcribeHealthAudio, uploadAndProcessHealthPdf } from './healthCaptureApi';
import { recordCategoryOptions, type HealthCaptureMethod, type HealthCategory, type HealthEvent, type HealthFactInput } from './types';
import { useHealthAudioRecorder } from './useHealthAudioRecorder';
import { useAppendHealthEvent, useHealthEvent } from './useHealthProfile';

type EntryMode = 'text' | 'audio' | 'pdf';

export function NewHealthRecordPage() {
  const [searchParams] = useSearchParams();
  const correctsId = searchParams.get('corrige') ?? undefined;
  const { data: correctedEvent, isLoading, isError } = useHealthEvent(correctsId);

  if (correctsId && isLoading) return <HealthPageShell width="form"><HealthPageHeader title="Corrigir informação" backTo={`/perfil/saude/eventos/${correctsId}`} /><main className="px-4 py-6"><LoadingRows /></main></HealthPageShell>;
  if (correctsId && (isError || !correctedEvent)) return <HealthPageShell width="form"><HealthPageHeader title="Corrigir informação" backTo={`/perfil/saude/eventos/${correctsId}`} /><main className="px-4 py-6"><FeedbackMessage type="error">Não foi possível abrir a informação original.</FeedbackMessage></main></HealthPageShell>;
  return <HealthRecordForm key={correctedEvent?.id ?? 'new'} correctsId={correctsId} correctedEvent={correctedEvent} />;
}

function HealthRecordForm({ correctsId, correctedEvent }: { correctsId?: string; correctedEvent?: HealthEvent }) {
  const navigate = useNavigate();
  const appendEvent = useAppendHealthEvent();
  const recorder = useHealthAudioRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<EntryMode>('text');
  const [category, setCategory] = useState<HealthCategory>(correctedEvent?.category === 'anamnesis' ? 'other' : correctedEvent?.category ?? 'condition');
  const [title, setTitle] = useState(correctedEvent ? `Correção: ${correctedEvent.title}` : '');
  const [narrative, setNarrative] = useState(correctedEvent?.narrative ?? '');
  const [effectiveDate, setEffectiveDate] = useState(todayInputValue());
  const [error, setError] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentFacts, setDocumentFacts] = useState<HealthFactInput[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [documentWarnings, setDocumentWarnings] = useState<string[]>([]);
  const [usedAi, setUsedAi] = useState(false);

  function changeMode(next: EntryMode) {
    setMode(next);
    setError('');
    setTitle('');
    setNarrative('');
    setCategory(next === 'pdf' ? 'exam' : 'condition');
    setDocumentId(null);
    setDocumentFacts([]);
    setDocumentName('');
    setDocumentWarnings([]);
    setUsedAi(false);
  }

  async function finishRecording() {
    setCaptureBusy(true);
    setError('');
    try {
      const recording = await recorder.stop();
      if (!recording) throw new Error('A gravação ficou vazia.');
      const transcript = await transcribeHealthAudio(recording.blob, recording.mime);
      setNarrative(transcript);
      if (!title) setTitle('Registro por áudio');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível transcrever o áudio.');
    } finally {
      setCaptureBusy(false);
    }
  }

  async function selectPdf(file: File | undefined) {
    if (!file) return;
    setError('');
    setDocumentId(null);
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Somente documentos PDF são aceitos.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('O PDF deve ter no máximo 15 MB.');
      return;
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      setError('O arquivo selecionado não possui uma estrutura PDF válida.');
      return;
    }
    setCaptureBusy(true);
    setDocumentName(file.name);
    try {
      const result = await uploadAndProcessHealthPdf(file);
      setDocumentId(result.documentId);
      setTitle(result.proposal.title || file.name.replace(/\.pdf$/i, ''));
      setNarrative(result.proposal.narrative);
      setEffectiveDate(result.proposal.effective_date || todayInputValue());
      setDocumentFacts(result.proposal.facts);
      setDocumentWarnings(result.proposal.warnings);
      setUsedAi(result.usedAi);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível processar o PDF.');
    } finally {
      setCaptureBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveRecord() {
    const cleanTitle = title.trim();
    const cleanNarrative = narrative.trim();
    if (!cleanTitle) return setError('Dê um título curto para identificar este registro.');
    if (!cleanNarrative) return setError('Descreva a informação clínica que deseja registrar.');
    if (!effectiveDate) return setError('Informe quando essa informação aconteceu ou passou a valer.');
    if (mode === 'pdf' && !documentId) return setError('Envie e revise um PDF antes de confirmar.');
    if (mode === 'pdf' && documentFacts.some((fact) =>
      (fact.value_numeric != null && !Number.isFinite(fact.value_numeric))
      || (fact.value_numeric == null && !fact.value_text && fact.value_boolean == null && !fact.value_date))) {
      return setError('Revise os resultados extraídos: todo item mantido precisa ter um valor válido.');
    }

    setError('');
    try {
      await appendEvent.mutateAsync({
        category,
        eventType: correctsId ? 'correction' : mode === 'pdf' ? 'document_record' : category === 'exam' ? 'exam_result' : 'clinical_record',
        title: cleanTitle,
        narrative: cleanNarrative,
        effectiveAt: new Date(`${effectiveDate}T12:00:00`).toISOString(),
        captureMethod: modeToCaptureMethod(mode),
        correctsEventId: correctsId,
        documentId,
        content: mode === 'pdf' ? { original_filename: documentName, extracted_facts: documentFacts } : correctsId ? { correction_reason: 'user_correction' } : {},
        provenance: { submitted_via: 'onlyfit-mobile', input_mode: mode, ai_used: mode === 'audio' || usedAi, user_reviewed: true },
        facts: mode === 'pdf' ? documentFacts : [],
      });
      navigate('/perfil/saude', { replace: true, state: { success: correctsId ? 'Correção adicionada ao histórico.' : 'Registro adicionado ao histórico.' } });
    } catch {
      setError('Não foi possível salvar o registro. Tente novamente sem sair desta tela.');
    }
  }

  const canShowForm = mode === 'text' || mode === 'audio' || Boolean(documentId);
  return (
    <HealthPageShell width="form">
      <HealthPageHeader title={correctsId ? 'Corrigir informação' : 'Adicionar registro'} description={correctsId ? 'A informação anterior continuará no histórico' : 'Você revisa tudo antes de salvar'} backTo={correctsId ? `/perfil/saude/eventos/${correctsId}` : '/perfil/saude'} />
      <main className="space-y-6 px-4 py-6">
        {!correctsId ? (
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Forma de entrada">
            <ModeButton icon={FileText} label="Escrever" selected={mode === 'text'} onClick={() => changeMode('text')} />
            <ModeButton icon={Mic} label="Gravar" selected={mode === 'audio'} onClick={() => changeMode('audio')} />
            <ModeButton icon={Paperclip} label="PDF" selected={mode === 'pdf'} onClick={() => changeMode('pdf')} />
          </div>
        ) : null}

        {mode === 'audio' ? (
          <section className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-5 text-center">
            <span className={clsx('mx-auto flex h-14 w-14 items-center justify-center rounded-full', recorder.isRecording ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container')}><Mic size={24} aria-hidden /></span>
            <h2 className="mt-3 font-sans text-title text-on-surface">{recorder.isRecording ? formatDuration(recorder.elapsedMs) : narrative ? 'Transcrição pronta para revisão' : 'Gravar informação de saúde'}</h2>
            <p className="mt-2 font-sans text-body-sm text-on-surface-variant">O áudio é enviado somente para transcrição e não é armazenado. Apenas o texto revisado será salvo.</p>
            {recorder.isRecording ? (
              <button type="button" onClick={() => void finishRecording()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-error px-5 font-sans text-label text-on-error"><Square size={16} fill="currentColor" aria-hidden /> Parar e transcrever</button>
            ) : (
              <button type="button" onClick={() => void recorder.start().catch((value) => setError(value instanceof Error ? value.message : 'Permita o acesso ao microfone.'))} disabled={captureBusy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
                {captureBusy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Mic size={17} aria-hidden />} {captureBusy ? 'Transcrevendo...' : narrative ? 'Gravar novamente' : 'Iniciar gravação'}
              </button>
            )}
          </section>
        ) : null}

        {mode === 'pdf' ? (
          <section className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-5 text-center">
            {documentId ? <FileCheck2 size={26} className="mx-auto text-primary" aria-hidden /> : <Paperclip size={26} className="mx-auto text-primary" aria-hidden />}
            <h2 className="mt-3 font-sans text-title text-on-surface">{documentId ? 'PDF pronto para revisão' : 'Adicionar documento PDF'}</h2>
            <p className="mt-2 font-sans text-body-sm text-on-surface-variant">{documentName || 'Somente PDF, com até 15 MB. O original fica armazenado de forma privada.'}</p>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void selectPdf(event.target.files?.[0])} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={captureBusy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
              {captureBusy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Upload size={17} aria-hidden />} {captureBusy ? 'Enviando e analisando...' : documentId ? 'Trocar PDF' : 'Selecionar PDF'}
            </button>
          </section>
        ) : null}

        {documentWarnings.length ? (
          <div className="space-y-2">{documentWarnings.map((warning) => <FeedbackMessage key={warning} type="info">{warning}</FeedbackMessage>)}</div>
        ) : null}
        {canShowForm ? (
          <section className="space-y-4">
            <SelectField label="Categoria" value={category} onChange={(value) => setCategory(value as HealthCategory)} options={recordCategoryOptions} />
            <TextField label="Título" hint="Exemplo: Dor no joelho direito" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
            <TextField label="Data da informação" type="date" max={todayInputValue()} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            <TextAreaField label={correctsId ? 'Informação correta' : mode === 'audio' ? 'Transcrição revisada' : mode === 'pdf' ? 'Resumo revisado' : 'Descrição'} hint={mode === 'text' ? 'Este texto será salvo diretamente, sem análise por IA.' : 'Edite qualquer informação antes de confirmar.'} value={narrative} onChange={(event) => setNarrative(event.target.value)} maxLength={5000} className="min-h-[160px]" />
            {mode === 'pdf' && documentFacts.length ? <ExtractedFacts facts={documentFacts} onChange={setDocumentFacts} /> : null}
          </section>
        ) : null}

        {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
        {canShowForm ? (
          <button type="button" onClick={() => void saveRecord()} disabled={appendEvent.isPending || captureBusy || recorder.isRecording} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60">
            {appendEvent.isPending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Check size={18} aria-hidden />}
            {appendEvent.isPending ? 'Salvando...' : correctsId ? 'Adicionar correção' : 'Confirmar registro'}
          </button>
        ) : null}
      </main>
    </HealthPageShell>
  );
}

function ExtractedFacts({ facts, onChange }: { facts: HealthFactInput[]; onChange: (facts: HealthFactInput[]) => void }) {
  function update(index: number, patch: Partial<HealthFactInput>) {
    onChange(facts.map((fact, itemIndex) => itemIndex === index
      ? { ...fact, ...patch, metadata: { ...fact.metadata, user_edited: true } }
      : fact));
  }

  return (
    <fieldset className="rounded-2xl border border-outline-variant/40 px-4 py-4">
      <legend className="px-1 font-sans text-body-sm font-medium text-on-surface-variant">Resultados extraídos — confira e corrija</legend>
      <div className="space-y-3">
        {facts.map((fact, index) => (
          <div key={`${fact.canonical_key}-${index}`} className="rounded-xl bg-surface-container-low px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 font-sans text-body font-medium text-on-surface">{fact.display}</span>
              <button type="button" onClick={() => onChange(facts.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Não salvar ${fact.display}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container-high">
                <Trash2 size={17} aria-hidden />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(84px,0.55fr)] gap-2">
              <label>
                <span className="sr-only">Valor de {fact.display}</span>
                <input
                  type={fact.value_numeric != null ? 'number' : 'text'}
                  inputMode={fact.value_numeric != null ? 'decimal' : 'text'}
                  value={fact.value_numeric ?? fact.value_text ?? ''}
                  onChange={(event) => fact.value_numeric != null
                    ? update(index, { value_numeric: event.target.value === '' ? undefined : Number(event.target.value) })
                    : update(index, { value_text: event.target.value })}
                  className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label>
                <span className="sr-only">Unidade de {fact.display}</span>
                <input value={fact.unit ?? ''} onChange={(event) => update(index, { unit: event.target.value })} placeholder="Unidade" className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface px-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
              </label>
            </div>
            {fact.reference_text ? <p className="mt-2 font-sans text-body-sm text-on-surface-variant">Referência no documento: {fact.reference_text}</p> : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function ModeButton({ icon: Icon, label, selected, onClick }: { icon: typeof FileText; label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={selected} onClick={onClick} className={clsx('flex min-h-12 items-center justify-center gap-2 rounded-xl font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant')}><Icon size={17} aria-hidden /> {label}</button>;
}

function modeToCaptureMethod(mode: EntryMode): HealthCaptureMethod {
  if (mode === 'audio') return 'audio_transcript';
  if (mode === 'pdf') return 'pdf';
  return 'text';
}

function formatDuration(value: number) {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
