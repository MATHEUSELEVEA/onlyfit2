import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, ArrowLeft, Bandage, Camera, FileCheck2, FileHeart, FileText, HeartPulse, Loader2, Mic, Moon, Paperclip, Pill, Plus, Square, Stethoscope, Syringe, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { FeedbackMessage, HealthPageHeader, HealthPageShell, LoadingRows } from './components/HealthPrimitives';
import { extractHealthPhoto, transcribeHealthAudio, uploadAndProcessHealthPdf } from './healthCaptureApi';
import { healthCategoryLabels, type HealthCaptureMethod, type HealthCategory, type HealthEvent, type HealthFactInput } from './types';
import { useHealthAudioRecorder } from './useHealthAudioRecorder';
import { useAppendHealthEvent, useHealthConsents, useHealthEvent, useRecordHealthConsent } from './useHealthProfile';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PROFILE_CONSENT = 'Autorizo o tratamento das informações que eu registrar para criar e manter minha Ficha de saúde no OnlyFit.';

export function NewHealthRecordPage() {
  const [searchParams] = useSearchParams();
  const correctsId = searchParams.get('corrige') ?? undefined;
  const { data: correctedEvent, isLoading, isError } = useHealthEvent(correctsId);
  const { data: consents = [], isLoading: consentsLoading, isError: consentsError, refetch: refetchConsents } = useHealthConsents();
  const hasProfileConsent = consents.find((consent) => consent.purpose === 'profile_storage')?.action === 'granted';

  if (correctsId && isLoading) return <HealthPageShell width="form"><HealthPageHeader title="Corrigir informação" backTo={`/perfil/saude/eventos/${correctsId}`} /><main className="px-4 py-6"><LoadingRows /></main></HealthPageShell>;
  if (correctsId && (isError || !correctedEvent)) return <HealthPageShell width="form"><HealthPageHeader title="Corrigir informação" backTo={`/perfil/saude/eventos/${correctsId}`} /><main className="px-4 py-6"><FeedbackMessage type="error">Não foi possível abrir a informação original.</FeedbackMessage></main></HealthPageShell>;
  if (consentsLoading) return <HealthPageShell width="form"><HealthPageHeader title="Adicionar registro" backTo="/meu-fit" /><main className="px-4 py-6"><LoadingRows /></main></HealthPageShell>;
  if (consentsError) return <HealthPageShell width="form"><HealthPageHeader title="Adicionar registro" backTo="/meu-fit" /><main className="px-4 py-6"><FeedbackMessage type="error">Não foi possível verificar a autorização da sua Ficha de saúde.</FeedbackMessage><button type="button" onClick={() => void refetchConsents()} className="mt-4 min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary">Tentar novamente</button></main></HealthPageShell>;
  if (!hasProfileConsent) return <HealthRecordConsentGate />;
  return <HealthRecordForm key={correctedEvent?.id ?? 'new'} correctsId={correctsId} correctedEvent={correctedEvent} />;
}

function HealthRecordConsentGate() {
  const navigate = useNavigate();
  const recordConsent = useRecordHealthConsent();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');

  async function authorize() {
    if (!checked) {
      setError('Confirme o uso dos dados para salvar seu registro de saúde.');
      return;
    }
    setError('');
    try {
      await recordConsent.mutateAsync({ purpose: 'profile_storage', action: 'granted', statement: PROFILE_CONSENT });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível registrar sua autorização.');
    }
  }

  return <HealthPageShell width="form">
    <HealthPageHeader title="Antes de registrar" description="Sua Ficha de saúde é privada" onBack={() => navigate('/meu-fit')} />
    <main className="space-y-5 px-4 py-6">
      <p className="font-sans text-body text-on-surface-variant">Para salvar check-ins, sintomas e demais registros, precisamos da sua autorização para manter esses dados na sua Ficha de saúde.</p>
      <label className="flex items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface-container p-4">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
        <span className="font-sans text-body text-on-surface">{PROFILE_CONSENT}</span>
      </label>
      {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
      <button type="button" onClick={() => void authorize()} disabled={recordConsent.isPending} className="min-h-12 w-full rounded-xl bg-primary font-sans text-label text-on-primary disabled:opacity-60">{recordConsent.isPending ? 'Salvando autorização...' : 'Continuar para o registro'}</button>
    </main>
  </HealthPageShell>;
}

function HealthRecordForm({ correctsId, correctedEvent }: { correctsId?: string; correctedEvent?: HealthEvent }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appendEvent = useAppendHealthEvent();
  const recorder = useHealthAudioRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(correctsId ? 2 : 1);
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
  const [usedAudio, setUsedAudio] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [showMyFitSuccess, setShowMyFitSuccess] = useState(false);
  const [sleepHours, setSleepHours] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [hungerScore, setHungerScore] = useState(5);
  const [energyScore, setEnergyScore] = useState(3);
  const openedFromMyFit = searchParams.get('origem') === 'meu-fit' && !correctsId;
  const isHabit = category === 'habit';

  // A foto nunca sai do dispositivo depois da leitura: a prévia é um object URL
  // local e precisa ser revogada para não vazar memória entre trocas de anexo.
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const usesExtractedFacts = Boolean(documentId) || photoReviewed;

  async function finishRecording() {
    setCaptureBusy(true);
    setError('');
    try {
      const recording = await recorder.stop();
      if (!recording) throw new Error('A gravação ficou vazia.');
      const transcript = await transcribeHealthAudio(recording.blob, recording.mime);
      setNarrative((current) => [current.trim(), transcript.trim()].filter(Boolean).join('\n\n'));
      if (!title) setTitle('Registro por áudio');
      setUsedAudio(true);
      setUsedAi(true);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Não foi possível transcrever o áudio.');
    } finally {
      setCaptureBusy(false);
    }
  }

  async function selectPhoto(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Envie uma foto JPEG, PNG ou WEBP.');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('A foto deve ter no máximo 10 MB.');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    setPhotoReviewed(false);
    setCaptureBusy(true);
    setPhotoPreview(URL.createObjectURL(file));
    try {
      const proposal = await extractHealthPhoto(file);
      setTitle((current) => current.trim() ? current : proposal.title);
      setNarrative((current) => current.trim() ? current : proposal.narrative);
      setEffectiveDate(proposal.effective_date || todayInputValue());
      setExtractedFacts(proposal.facts);
      setCaptureWarnings(proposal.warnings);
      setPhotoReviewed(true);
      setDocumentId(null);
      setDocumentName('');
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
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Somente documentos PDF são aceitos.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('O PDF deve ter no máximo 15 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== '%PDF-') {
      setError('O arquivo selecionado não possui uma estrutura PDF válida.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setDocumentId(null);
    setCaptureBusy(true);
    setDocumentName(file.name);
    try {
      const result = await uploadAndProcessHealthPdf(file);
      setDocumentId(result.documentId);
      setTitle((current) => current.trim() ? current : result.proposal.title || file.name.replace(/\.pdf$/i, ''));
      setNarrative((current) => current.trim() ? current : result.proposal.narrative);
      setEffectiveDate(result.proposal.effective_date || todayInputValue());
      setExtractedFacts(result.proposal.facts);
      setCaptureWarnings(result.proposal.warnings);
      setPhotoPreview('');
      setPhotoReviewed(false);
      setUsedAi((current) => current || result.usedAi);
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
    if (!isHabit && usesExtractedFacts && extractedFacts.some((fact) =>
      (fact.value_numeric != null && !Number.isFinite(fact.value_numeric))
      || (fact.value_numeric == null && !fact.value_text && fact.value_boolean == null && !fact.value_date))) {
      return setError('Revise os resultados extraídos: todo item mantido precisa ter um valor válido.');
    }

    setError('');
    try {
      const captureMethod: HealthCaptureMethod = isHabit ? 'text' : documentId ? 'pdf' : photoReviewed ? 'photo' : usedAudio ? 'audio_transcript' : 'text';
      await appendEvent.mutateAsync({
        category,
        eventType: correctsId ? 'correction' : !isHabit && documentId ? 'document_record' : category === 'exam' ? 'exam_result' : 'clinical_record',
        title: isHabit ? 'Check-in do dia' : cleanTitle,
        narrative: isHabit ? (cleanNarrative || null) : cleanNarrative,
        effectiveAt: new Date(`${effectiveDate}T12:00:00`).toISOString(),
        captureMethod,
        correctsEventId: correctsId,
        documentId: isHabit ? null : documentId,
        content: isHabit ? { checkin: { sleep_hours: sleepHours, sleep_quality: sleepQuality, hunger_score: hungerScore, energy_score: energyScore } }
          : documentId ? { original_filename: documentName, extracted_facts: extractedFacts }
          : photoReviewed ? { extracted_facts: extractedFacts, photo_saved: false }
          : correctsId ? { correction_reason: 'user_correction' } : {},
        provenance: { submitted_via: 'onlyfit-mobile', input_mode: captureMethod, ai_used: isHabit ? false : usedAi, user_reviewed: true },
        facts: isHabit ? habitFacts({ sleepHours, sleepQuality, hungerScore, energyScore, effectiveDate }) : usesExtractedFacts ? extractedFacts : [],
      });
      if (openedFromMyFit) {
        setShowMyFitSuccess(true);
      } else {
        navigate('/perfil/saude', { replace: true, state: { success: correctsId ? 'Correção adicionada ao histórico.' : 'Registro adicionado ao histórico.' } });
      }
    } catch (value) {
      const message = value instanceof Error ? value.message : '';
      setError(message === 'health_profile_storage_not_authorized'
        ? 'Sua autorização de armazenamento não foi encontrada. Volte e confirme a autorização da Ficha de saúde.'
        : 'Não foi possível salvar o registro. Tente novamente sem sair desta tela.');
    }
  }

  return (
    <HealthPageShell width="form">
      <HealthPageHeader
        title={correctsId ? 'Corrigir informação' : 'Adicionar registro'}
        description={correctsId ? 'A informação anterior continuará no histórico' : 'Você revisa tudo antes de salvar'}
        backTo={correctsId ? `/perfil/saude/eventos/${correctsId}` : openedFromMyFit ? '/meu-fit' : '/perfil/saude'}
        onBack={!correctsId && step > 1 ? () => setStep((current) => current - 1) : undefined}
      />
      <main className="space-y-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6">
        {!correctsId ? <WizardProgress step={step} /> : null}
        {step > 1 && !correctsId ? <button type="button" onClick={() => setStep((current) => current - 1)} className="-ml-2 flex min-h-11 items-center gap-1 px-2 font-sans text-label text-on-surface-variant"><ArrowLeft size={18} aria-hidden /> Voltar</button> : null}
        {step === 1 ? <RecordTypeStep category={category} onSelect={(value) => { setCategory(value); setError(''); setStep(2); }} /> : null}
        {step === 2 && isHabit ? (
          <section className="space-y-5">
            <DailyCheckinStep sleepHours={sleepHours} sleepQuality={sleepQuality} hungerScore={hungerScore} energyScore={energyScore} onSleepHours={setSleepHours} onSleepQuality={setSleepQuality} onHungerScore={setHungerScore} onEnergyScore={setEnergyScore} />
            <TextField label="Data do check-in" type="date" max={todayInputValue()} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            <TextAreaField label="Observação (opcional)" hint="Algo que queira lembrar sobre hoje?" value={narrative} onChange={(event) => setNarrative(event.target.value)} maxLength={5000} autoCapitalize="sentences" className="min-h-[120px]" />
          </section>
        ) : null}
        {step === 2 && !isHabit ? (
          <section className="space-y-5">
            <div>
              <h2 className="font-sans text-title-lg text-on-surface">Conte os detalhes</h2>
              <p className="mt-1 font-sans text-body-sm text-on-surface-variant">Escreva, fale ou envie um arquivo. Você pode revisar tudo antes de salvar.</p>
            </div>
            <NarrativeComposer
              value={narrative}
              onChange={setNarrative}
              isRecording={recorder.isRecording}
              elapsedMs={recorder.elapsedMs}
              busy={captureBusy}
              onStart={() => { setError(''); void recorder.start().catch((value) => setError(value instanceof Error ? value.message : 'Permita o acesso ao microfone.')); }}
              onStop={() => void finishRecording()}
            />
            <AttachmentPicker
              fileInputRef={fileInputRef}
              photoInputRef={photoInputRef}
              busy={captureBusy}
              disabled={captureBusy || recorder.isRecording}
              documentName={documentName}
              hasDocument={Boolean(documentId)}
              photoPreview={photoPreview}
              photoReviewed={photoReviewed}
              onSelectPhoto={selectPhoto}
              onSelectPdf={selectPdf}
              onRemovePhoto={() => { setPhotoPreview(''); setPhotoReviewed(false); setExtractedFacts([]); setCaptureWarnings([]); }}
              onRemovePdf={() => { setDocumentId(null); setDocumentName(''); setExtractedFacts([]); setCaptureWarnings([]); }}
            />
            <TextField label="Título" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" />
            <TextField label="Data da informação" type="date" max={todayInputValue()} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            {usesExtractedFacts && extractedFacts.length ? <ExtractedFacts facts={extractedFacts} onChange={setExtractedFacts} /> : null}
          </section>
        ) : null}

        {step === 2 && captureWarnings.length ? (
          <div className="space-y-2">{captureWarnings.map((warning) => <FeedbackMessage key={warning} type="info">{warning}</FeedbackMessage>)}</div>
        ) : null}

        {error ? <FeedbackMessage type="error">{error}</FeedbackMessage> : null}
        {step === 2 ? <WizardAction disabled={appendEvent.isPending || captureBusy || recorder.isRecording} onClick={() => void saveRecord()}>{appendEvent.isPending ? 'Salvando...' : correctsId ? 'Adicionar correção' : 'Salvar registro'}</WizardAction> : null}
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
  return <div><div className="flex items-center justify-between"><span className="font-sans text-body-sm text-on-surface-variant">{step} de 2</span><span className="font-sans text-body-sm text-on-surface-variant">Adicionar registro</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-container-high"><span className="block h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${step / 2 * 100}%` }} /></div></div>;
}

function RecordTypeStep({ category, onSelect }: { category: HealthCategory | null; onSelect: (value: HealthCategory) => void }) {
  return <section><h2 className="font-sans text-title-lg text-on-surface">O que você quer registrar?</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Toque em uma opção para seguir.</p><div className="mt-6 grid grid-cols-3 gap-2">{recordTypes.map(({ value, icon: Icon }) => { const selected = category === value; return <button key={value} type="button" aria-label={`${healthCategoryLabels[value]}. Selecionar e seguir`} onClick={() => onSelect(value)} className={clsx('flex min-h-[116px] flex-col items-center justify-center gap-3 rounded-2xl border p-2 text-center transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none', selected ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container')}><Icon size={25} className="text-primary" aria-hidden /><span className="font-sans text-counter text-on-surface">{healthCategoryLabels[value]}</span></button>; })}</div></section>;
}

function DailyCheckinStep({ sleepHours, sleepQuality, hungerScore, energyScore, onSleepHours, onSleepQuality, onHungerScore, onEnergyScore }: { sleepHours: number; sleepQuality: number; hungerScore: number; energyScore: number; onSleepHours: (value: number) => void; onSleepQuality: (value: number) => void; onHungerScore: (value: number) => void; onEnergyScore: (value: number) => void }) {
  return <section><h2 className="font-sans text-title-lg text-on-surface">Como foi seu dia?</h2><p className="mt-1 font-sans text-body-sm text-on-surface-variant">Um check-in rápido para perceber seus padrões com o tempo.</p><div className="mt-7 space-y-5"><RangeQuestion label="Quanto você dormiu?" value={sleepHours} min={0} max={12} step={0.5} suffix="h" onChange={onSleepHours} /><RangeQuestion label="Como foi seu sono?" value={sleepQuality} min={1} max={5} suffix="/5" onChange={onSleepQuality} /><RangeQuestion label="Quanta fome sentiu hoje?" value={hungerScore} min={0} max={10} suffix="/10" onChange={onHungerScore} /><RangeQuestion label="Como estava sua energia?" value={energyScore} min={1} max={5} suffix="/5" onChange={onEnergyScore} /></div></section>;
}

function RangeQuestion({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="block rounded-2xl border border-outline-variant/40 bg-surface-container p-4"><span className="flex items-baseline justify-between gap-3 font-sans text-label text-on-surface"><span>{label}</span><strong className="text-title text-primary">{value}{suffix}</strong></span><input className="mt-4 w-full accent-primary" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function WizardAction({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-sans text-label text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none">{children}</button>;
}

function habitFacts({ sleepHours, sleepQuality, hungerScore, energyScore, effectiveDate }: { sleepHours: number; sleepQuality: number; hungerScore: number; energyScore: number; effectiveDate: string }): HealthFactInput[] {
  return [
    { fact_type: 'daily_checkin', canonical_key: 'sleep_hours', display: 'Horas de sono', value_numeric: sleepHours, unit: 'h', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'sleep_quality', display: 'Qualidade do sono', value_numeric: sleepQuality, unit: '/5', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'hunger_score', display: 'Fome', value_numeric: hungerScore, unit: '/10', effective_at: effectiveDate },
    { fact_type: 'daily_checkin', canonical_key: 'energy_score', display: 'Energia', value_numeric: energyScore, unit: '/5', effective_at: effectiveDate },
  ];
}

function NarrativeComposer({ value, onChange, isRecording, elapsedMs, busy, onStart, onStop }: {
  value: string;
  onChange: (value: string) => void;
  isRecording: boolean;
  elapsedMs: number;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const actionLabel = isRecording ? `${formatDuration(elapsedMs)} · Parar` : busy ? 'Aguarde' : 'Falar';

  return (
    <div className="space-y-1.5">
      <label htmlFor="health-record-description" className="block font-sans text-body-sm font-medium text-on-surface-variant">Descrição</label>
      <div className="relative">
        <textarea
          id="health-record-description"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={5000}
          autoCapitalize="sentences"
          placeholder="Conte o que aconteceu, os resultados ou as orientações que recebeu..."
          className="min-h-[148px] w-full resize-none rounded-xl border border-outline-variant/50 bg-surface-container-low px-3.5 pb-16 pt-3 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="button"
          onClick={isRecording ? onStop : onStart}
          disabled={busy && !isRecording}
          aria-label={isRecording ? 'Parar gravação e transcrever' : 'Ditar descrição pelo microfone'}
          className={clsx(
            'absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-sans text-label transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
            isRecording ? 'bg-error text-on-error' : 'bg-primary text-on-primary',
          )}
        >
          {busy && !isRecording ? <Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden /> : isRecording ? <Square size={15} fill="currentColor" aria-hidden /> : <Mic size={17} aria-hidden />}
          {actionLabel}
        </button>
      </div>
      <p aria-live="polite" className="font-sans text-body-sm text-on-surface-variant">
        {isRecording ? 'Gravando agora. Toque em Parar para transformar sua fala em texto.' : busy ? 'Processando sua informação...' : 'Se preferir, dite pelo microfone. O áudio não fica armazenado.'}
      </p>
    </div>
  );
}

function AttachmentPicker({ fileInputRef, photoInputRef, busy, disabled, documentName, hasDocument, photoPreview, photoReviewed, onSelectPhoto, onSelectPdf, onRemovePhoto, onRemovePdf }: {
  fileInputRef: RefObject<HTMLInputElement>;
  photoInputRef: RefObject<HTMLInputElement>;
  busy: boolean;
  disabled: boolean;
  documentName: string;
  hasDocument: boolean;
  photoPreview: string;
  photoReviewed: boolean;
  onSelectPhoto: (file: File | undefined) => Promise<void>;
  onSelectPdf: (file: File | undefined) => Promise<void>;
  onRemovePhoto: () => void;
  onRemovePdf: () => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="font-sans text-body-sm font-medium text-on-surface-variant">Anexo (opcional)</legend>
      <p className="font-sans text-body-sm text-on-surface-variant">Envie uma foto ou um PDF para preencher os campos automaticamente.</p>
      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onSelectPhoto(event.target.files?.[0])} />
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => void onSelectPdf(event.target.files?.[0])} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => photoInputRef.current?.click()} disabled={disabled} className="flex min-h-[76px] items-center gap-3 rounded-xl border border-outline-variant/50 bg-surface-container px-3 text-left transition-colors active:bg-surface-container-high disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container"><Camera size={19} aria-hidden /></span>
          <span><strong className="block font-sans text-label text-on-surface">Foto</strong><span className="font-sans text-counter text-on-surface-variant">JPEG, PNG ou WEBP</span></span>
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled} className="flex min-h-[76px] items-center gap-3 rounded-xl border border-outline-variant/50 bg-surface-container px-3 text-left transition-colors active:bg-surface-container-high disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container"><Paperclip size={19} aria-hidden /></span>
          <span><strong className="block font-sans text-label text-on-surface">PDF</strong><span className="font-sans text-counter text-on-surface-variant">Documento até 15 MB</span></span>
        </button>
      </div>
      {photoPreview ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
          <img src={photoPreview} alt="Prévia da foto selecionada" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
          <span className="min-w-0 flex-1">
            <strong className="block font-sans text-label text-on-surface">{photoReviewed ? 'Foto analisada' : busy ? 'Lendo a foto...' : 'Não foi possível analisar a foto'}</strong>
            <span className="font-sans text-body-sm text-on-surface-variant">A imagem é descartada depois da leitura.</span>
          </span>
          {busy && !photoReviewed ? <Loader2 size={18} className="shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden /> : <button type="button" onClick={onRemovePhoto} aria-label="Remover foto" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Trash2 size={18} aria-hidden /></button>}
        </div>
      ) : null}
      {documentName ? (
        <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">{hasDocument ? <FileCheck2 size={20} aria-hidden /> : busy ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Paperclip size={20} aria-hidden />}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate font-sans text-label text-on-surface">{documentName}</strong><span className="font-sans text-body-sm text-on-surface-variant">{hasDocument ? 'PDF pronto para revisão' : busy ? 'Enviando e analisando...' : 'Não foi possível analisar o PDF'}</span></span>
          {!busy ? <button type="button" onClick={onRemovePdf} aria-label="Remover PDF" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Trash2 size={18} aria-hidden /></button> : null}
        </div>
      ) : null}
    </fieldset>
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

function formatDuration(value: number) {
  const seconds = Math.floor(value / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
