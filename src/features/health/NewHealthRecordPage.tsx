import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, Bandage, Camera, FileCheck2, FileHeart, FileText, HeartPulse, Loader2, Mic, Moon, Paperclip, Pill, Plus, Square, Stethoscope, Syringe, Trash2, Upload } from 'lucide-react';
import { clsx } from 'clsx';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { extractHealthPhoto, transcribeHealthAudio, uploadAndProcessHealthPdf } from './healthCaptureApi';
import { healthCategoryLabels, type HealthCaptureMethod, type HealthCategory, type HealthEvent, type HealthFactInput } from './types';
import { useHealthAudioRecorder } from './useHealthAudioRecorder';
import { useAppendHealthEvent, useHealthEvent } from './useHealthProfile';

type EntryMode = 'text' | 'audio' | 'photo' | 'pdf';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const [searchParams] = useSearchParams();
  const appendEvent = useAppendHealthEvent();
  const recorder = useHealthAudioRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(correctsId ? 3 : 1);
  const [mode, setMode] = useState<EntryMode>('text');
  const [category, setCategory] = useState<HealthCategory | null>(correctedEvent?.category === 'anamnesis' ? 'other' : correctedEvent?.category ?? null);
  const [title, setTitle] = useState(correctedEvent ? `Correção: ${correctedEvent.title}` : '');
  const [narrative, setNarrative] = useState(correctedEvent?.narrative ?? '');
  const [effectiveDate, setEffectiveDate] = useState(todayInputValue());
  const [error, setError] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [extractedFacts, setExtractedFacts] = useState<HealthFactInput[]>([]);
  const [documentName, setDocumentName] = useState('');
  const [captureWarnings, setCaptureWarnings] = useState<string[]>([]);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoReviewed, setPhotoReviewed] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [showMyFitSuccess, setShowMyFitSuccess] = useState(false);
  const [sleepHours, setSleepHours] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [hungerScore, setHungerScore] = useState(5);
  const [energyScore, setEnergyScore] = useState(3);
  const openedFromMyFit = searchParams.get('origem') === 'meu-fit' && !correctsId;
  const isHabit = category === 'habit';

  // A foto nunca sai do dispositivo depois da leitura: a prévia é um object URL
  // local e precisa ser revogada para não vazar memória entre trocas de modo.
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const usesExtractedFacts = mode === 'pdf' || mode === 'photo';

  function changeMode(next: EntryMode) {
    setMode(next);
    setError('');
    setTitle('');
    setNarrative('');
    setDocumentId(null);
    setExtractedFacts([]);
    setDocumentName('');
    setCaptureWarnings([]);
    setPhotoPreview('');
    setPhotoReviewed(false);
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

  async function selectPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    setPhotoReviewed(false);
    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Envie uma foto JPEG, PNG ou WEBP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('A foto deve ter no máximo 10 MB.');
      return;
    }
    setCaptureBusy(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const proposal = await extractHealthPhoto(file);
      setTitle(proposal.title);
      setNarrative(proposal.narrative);
      setEffectiveDate(proposal.effective_date || todayInputValue());
      setExtractedFacts(proposal.facts);
      setCaptureWarnings(proposal.warnings);
      setPhotoReviewed(true);
      setUsedAi(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível ler a foto.');
    } finally {
      setCaptureBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
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
      setExtractedFacts(result.proposal.facts);
      setCaptureWarnings(result.proposal.warnings);
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
    if (!category) return setError('Escolha o tipo de registro.');
    if (!isHabit && !cleanTitle) return setError('Dê um título curto para identificar este registro.');
    if (!isHabit && !cleanNarrative) return setError('Descreva a informação clínica que deseja registrar.');
    if (!effectiveDate) return setError('Informe quando essa informação aconteceu ou passou a valer.');
    if (mode === 'pdf' && !documentId) return setError('Envie e revise um PDF antes de confirmar.');
    if (mode === 'photo' && !photoReviewed) return setError('Envie e revise uma foto antes de confirmar.');
    if (usesExtractedFacts && extractedFacts.some((fact) =>
      (fact.value_numeric != null && !Number.isFinite(fact.value_numeric))
      || (fact.value_numeric == null && !fact.value_text && fact.value_boolean == null && !fact.value_date))) {
      return setError('Revise os resultados extraídos: todo item mantido precisa ter um valor válido.');
    }

    setError('');
    try {
      await appendEvent.mutateAsync({
        category,
        eventType: correctsId ? 'correction' : mode === 'pdf' ? 'document_record' : category === 'exam' ? 'exam_result' : 'clinical_record',
        title: isHabit ? 'Check-in do dia' : cleanTitle,
        narrative: isHabit ? (cleanNarrative || null) : cleanNarrative,
        effectiveAt: new Date(`${effectiveDate}T12:00:00`).toISOString(),
        captureMethod: modeToCaptureMethod(mode),
        correctsEventId: correctsId,
        documentId,
        content: isHabit ? { checkin: { sleep_hours: sleepHours, sleep_quality: sleepQuality, hunger_score: hungerScore, energy_score: energyScore } }
          : mode === 'pdf' ? { original_filename: documentName, extracted_facts: extractedFacts }
          : mode === 'photo' ? { extracted_facts: extractedFacts, photo_saved: false }
          : correctsId ? { correction_reason: 'user_correction' } : {},
        provenance: { submitted_via: 'onlyfit-mobile', input_mode: mode, ai_used: mode === 'audio' || usedAi, user_reviewed: true },
        facts: isHabit ? habitFacts({ sleepHours, sleepQuality, hungerScore, energyScore, effectiveDate }) : usesExtractedFacts ? extractedFacts : [],
      });
      if (openedFromMyFit) {
        setShowMyFitSuccess(true);
      } else {
        navigate('/perfil/saude', { replace: true, state: { success: correctsId ? 'Correção adicionada ao histórico.' : 'Registro adicionado ao histórico.' } });
      }
    } catch {
      setError('Não foi possível salvar o registro. Tente novamente sem sair desta tela.');
    }
  }

  const canShowForm = mode === 'text' || mode === 'audio' || (mode === 'pdf' && Boolean(documentId)) || (mode === 'photo' && photoReviewed);
  return (
    <HealthPageShell width="form">
      <HealthPageHeader title={correctsId ? 'Corrigir informação' : 'Adicionar registro'} description={correctsId ? 'A informação anterior continuará no histórico' : 'Você revisa tudo antes de salvar'} backTo={correctsId ? `/perfil/saude/eventos/${correctsId}` : openedFromMyFit ? '/meu-fit' : '/perfil/saude'} />
      <main className="space-y-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6">
        {!correctsId ? <WizardProgress step={step} /> : null}
        {step > 1 && !correctsId ? <button type="button" onClick={() => setStep((current) => current - 1)} className="-ml-2 flex min-h-11 items-center gap-1 px-2 font-sans text-label text-on-surface-variant"><ArrowLeft size={18} aria-hidden /> Voltar</button> : null}
        {step === 1 ? <RecordTypeStep category={category} onSelect={(value) => { setCategory(value); setError(''); }} /> : null}
        {step === 2 && isHabit ? <DailyCheckinStep sleepHours={sleepHours} sleepQuality={sleepQuality} hungerScore={hungerScore} energyScore={energyScore} onSleepHours={setSleepHours} onSleepQuality={setSleepQuality} onHungerScore={setHungerScore} onEnergyScore={setEnergyScore} /> : null}
        {step === 2 && !isHabit && !correctsId ? (
          <div className="grid grid-cols-4 gap-2" role="tablist" aria-label="Forma de entrada">
            <ModeButton icon={FileText} label="Escrever" selected={mode === 'text'} onClick={() => changeMode('text')} />
            <ModeButton icon={Mic} label="Gravar" selected={mode === 'audio'} onClick={() => changeMode('audio')} />
            <ModeButton icon={Camera} label="Foto" selected={mode === 'photo'} onClick={() => changeMode('photo')} />
            <ModeButton icon={Paperclip} label="PDF" selected={mode === 'pdf'} onClick={() => changeMode('pdf')} />
          </div>
        ) : null}

        {step === 2 && !isHabit && mode === 'audio' ? (
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

        {step === 2 && !isHabit && mode === 'photo' ? (
          <section className="rounded-2xl border border-outline-variant/40 bg-surface px-4 py-5 text-center">
            {photoPreview ? (
              <img src={photoPreview} alt="Foto enviada para leitura" className="mx-auto max-h-56 w-auto rounded-xl object-contain" />
            ) : (
              <Camera size={26} className="mx-auto text-primary" aria-hidden />
            )}
            <h2 className="mt-3 font-sans text-title text-on-surface">{photoReviewed ? 'Leitura pronta para revisão' : 'Fotografar informação de saúde'}</h2>
            <p className="mt-2 font-sans text-body-sm text-on-surface-variant">
              Fotografe receita, laudo, exame ou caixa de medicamento. A foto é enviada somente para leitura e não é armazenada: apenas o texto revisado será salvo.
            </p>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void selectPhoto(event.target.files?.[0])} />
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={captureBusy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary disabled:opacity-60">
              {captureBusy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Camera size={17} aria-hidden />} {captureBusy ? 'Lendo a foto...' : photoReviewed ? 'Trocar foto' : 'Tirar ou escolher foto'}
            </button>
          </section>
        ) : null}

        {step === 2 && !isHabit && mode === 'pdf' ? (
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

        {step === 2 && captureWarnings.length ? (
          <div className="space-y-2">{captureWarnings.map((warning) => <FeedbackMessage key={warning} type="info">{warning}</FeedbackMessage>)}</div>
        ) : null}
        {step === 3 && canShowForm ? (
          <section className="space-y-4">
            {isHabit ? <DailyCheckinReview sleepHours={sleepHours} sleepQuality={sleepQuality} hungerScore={hungerScore} energyScore={energyScore} /> : <TextField label="Título" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" />}
            <TextField label="Data da informação" type="date" max={todayInputValue()} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            <TextAreaField label={isHabit ? 'Observação (opcional)' : correctsId ? 'Informação correta' : mode === 'audio' ? 'Transcrição revisada' : mode === 'pdf' ? 'Resumo revisado' : mode === 'photo' ? 'Leitura revisada' : 'Descrição'} hint={isHabit ? 'Algo que queira lembrar sobre hoje?' : mode === 'text' ? undefined : 'Edite qualquer informação antes de confirmar.'} value={narrative} onChange={(event) => setNarrative(event.target.value)} maxLength={5000} autoCapitalize="sentences" className="min-h-[180px]" />
            {usesExtractedFacts && extractedFacts.length ? <ExtractedFacts facts={extractedFacts} onChange={setExtractedFacts} /> : null}
          </section>
        ) : null}

        {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
        {step === 1 ? <WizardAction disabled={!category} onClick={() => setStep(2)}>Continuar</WizardAction> : null}
        {step === 2 ? <WizardAction disabled={(!isHabit && !canShowForm) || captureBusy || recorder.isRecording} onClick={() => setStep(3)}>Continuar</WizardAction> : null}
        {step === 3 && canShowForm ? <WizardAction disabled={appendEvent.isPending || captureBusy || recorder.isRecording} onClick={() => void saveRecord()}>{appendEvent.isPending ? 'Salvando...' : correctsId ? 'Adicionar correção' : 'Confirmar registro'}</WizardAction> : null}
      </main>
      <BottomSheet
        open={showMyFitSuccess}
        onClose={() => navigate('/meu-fit', { replace: true })}
        title="Registro realizado com sucesso"
        description="O registro foi salvo na sua ficha de saúde."
      >
        <div className="px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={() => navigate('/meu-fit', { replace: true })}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            OK
          </button>
        </div>
      </BottomSheet>
    </HealthPageShell>
  );
}

const recordTypes = [
  { value: 'habit', icon: Moon, description: 'Sono, fome, energia e como foi o dia.' },
  { value: 'exam', icon: FileHeart, description: 'Exame, laudo ou resultado.' },
  { value: 'symptom', icon: Activity, description: 'Mal-estar, dor ou outro sintoma.' },
  { value: 'injury', icon: Bandage, description: 'Lesão ou desconforto físico.' },
  { value: 'condition', icon: HeartPulse, description: 'Condição ou diagnóstico.' },
  { value: 'procedure', icon: Stethoscope, description: 'Consulta, cirurgia ou procedimento.' },
  { value: 'physical_assessment', icon: Plus, description: 'Peso, medida ou avaliação corporal.' },
  { value: 'medication', icon: Pill, description: 'Medicamento, vitamina ou suplemento.' },
  { value: 'allergy', icon: AlertCircle, description: 'Alergia ou intolerância.' },
  { value: 'vaccine', icon: Syringe, description: 'Vacina ou dose de reforço.' },
  { value: 'other', icon: FileText, description: 'Outra informação de saúde.' },
] as const satisfies ReadonlyArray<{ value: HealthCategory; icon: typeof Activity; description: string }>;

function WizardProgress({ step }: { step: number }) {
  return <div><div className="flex items-center justify-between"><span className="font-sans text-body-sm text-on-surface-variant">{step} de 3</span><span className="font-sans text-body-sm text-on-surface-variant">Adicionar registro</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${step / 3 * 100}%` }} /></div></div>;
}

function RecordTypeStep({ category, onSelect }: { category: HealthCategory | null; onSelect: (value: HealthCategory) => void }) {
  return <section><h2 className="font-sans text-title-lg text-on-surface">O que você quer registrar?</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Escolha o tipo primeiro. Você adiciona texto ou anexos depois.</p><div className="mt-6 grid grid-cols-2 gap-3">{recordTypes.map(({ value, icon: Icon, description }) => { const selected = category === value; return <button key={value} type="button" aria-pressed={selected} onClick={() => onSelect(value)} className={clsx('flex min-h-[148px] flex-col items-start rounded-2xl border p-4 text-left transition-colors', selected ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><Icon size={26} className="text-primary" aria-hidden /><span className="mt-auto font-sans text-label text-on-surface">{healthCategoryLabels[value]}</span><span className="mt-1 font-sans text-body-sm text-on-surface-variant">{description}</span></button>; })}</div></section>;
}

function DailyCheckinStep({ sleepHours, sleepQuality, hungerScore, energyScore, onSleepHours, onSleepQuality, onHungerScore, onEnergyScore }: { sleepHours: number; sleepQuality: number; hungerScore: number; energyScore: number; onSleepHours: (value: number) => void; onSleepQuality: (value: number) => void; onHungerScore: (value: number) => void; onEnergyScore: (value: number) => void }) {
  return <section><h2 className="font-sans text-title-lg text-on-surface">Como foi seu dia?</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Um check-in rápido para perceber seus padrões com o tempo.</p><div className="mt-7 space-y-5"><RangeQuestion label="Quanto você dormiu?" value={sleepHours} min={0} max={12} step={0.5} suffix="h" onChange={onSleepHours} /><RangeQuestion label="Como foi seu sono?" value={sleepQuality} min={1} max={5} suffix="/5" onChange={onSleepQuality} /><RangeQuestion label="Quanta fome sentiu hoje?" value={hungerScore} min={0} max={10} suffix="/10" onChange={onHungerScore} /><RangeQuestion label="Como estava sua energia?" value={energyScore} min={1} max={5} suffix="/5" onChange={onEnergyScore} /></div></section>;
}

function RangeQuestion({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="block rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><span className="flex items-baseline justify-between gap-3 font-sans text-label text-on-surface"><span>{label}</span><strong className="text-title text-primary">{value}{suffix}</strong></span><input className="mt-4 w-full accent-primary" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function DailyCheckinReview({ sleepHours, sleepQuality, hungerScore, energyScore }: { sleepHours: number; sleepQuality: number; hungerScore: number; energyScore: number }) {
  return <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-container p-4 font-sans text-body-sm text-on-surface-variant"><span>Sono <strong className="block font-sans text-title text-on-surface">{sleepHours}h</strong></span><span>Qualidade <strong className="block font-sans text-title text-on-surface">{sleepQuality}/5</strong></span><span>Fome <strong className="block font-sans text-title text-on-surface">{hungerScore}/10</strong></span><span>Energia <strong className="block font-sans text-title text-on-surface">{energyScore}/5</strong></span></div>;
}

function WizardAction({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60">{children}</button>;
}

function habitFacts({ sleepHours, sleepQuality, hungerScore, energyScore, effectiveDate }: { sleepHours: number; sleepQuality: number; hungerScore: number; energyScore: number; effectiveDate: string }): HealthFactInput[] {
  return [
    { fact_type: 'daily_checkin', canonical_key: 'sleep_hours', display: 'Horas de sono', value_numeric: sleepHours, unit: 'h', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'sleep_quality', display: 'Qualidade do sono', value_numeric: sleepQuality, unit: '/5', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'hunger_score', display: 'Fome', value_numeric: hungerScore, unit: '/10', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'energy_score', display: 'Energia', value_numeric: energyScore, unit: '/5', effective_at: effectiveDate },
  ];
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
  return <button type="button" role="tab" aria-selected={selected} onClick={onClick} className={clsx('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', selected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant')}><Icon size={18} aria-hidden /> {label}</button>;
}

function modeToCaptureMethod(mode: EntryMode): HealthCaptureMethod {
  if (mode === 'audio') return 'audio_transcript';
  if (mode === 'photo') return 'photo';
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
