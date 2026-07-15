import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { SelectField, TextAreaField, TextField } from '@/components/ui/TextField';
import { useAffinityGroups } from '@/lib/sports';
import { uploadAsset } from '@/features/studio/upload';
import { useChallenge } from './useChallenge';
import {
  useChallengeTasks,
  useCreateChallenge,
  useUpdateChallenge,
  type ChallengeInput,
} from './useChallenges';
import { frequencyKey } from './format';
import type { ChallengeFrequency, ChallengeTaskDraft } from './types';

const FREQUENCIES: ChallengeFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'full'];
const THRESHOLDS = [100, 90, 80, 70];

function toDateInput(value: string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Criar e editar compartilham a tela: com :challengeId na rota é edição.
export function ChallengeFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { challengeId } = useParams<{ challengeId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const isEdit = Boolean(challengeId);

  const { data: challenge, isLoading: loadingChallenge } = useChallenge(challengeId);
  const { data: existingTasks = [], isLoading: loadingTasks } = useChallengeTasks(challengeId);
  const createMutation = useCreateChallenge(userId);
  const updateMutation = useUpdateChallenge(challengeId ?? '');
  const { groups, labelFor } = useAffinityGroups();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [threshold, setThreshold] = useState(100);
  const [limit, setLimit] = useState('');
  const [tasks, setTasks] = useState<ChallengeTaskDraft[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);

  // Preenche o formulário uma única vez quando o desafio chega (edição).
  useEffect(() => {
    if (!isEdit || !challenge || loadingTasks || hydratedFor.current === challenge.id) return;
    hydratedFor.current = challenge.id;
    setName(challenge.name ?? '');
    setDescription(challenge.description ?? '');
    setRules(challenge.rules_json?.text ?? '');
    setCategory(challenge.category);
    setVisibility(challenge.access_audience === 'invite_only' ? 'private' : 'public');
    setStartDate(toDateInput(challenge.start_at));
    setEndDate(toDateInput(challenge.end_at));
    setThreshold(challenge.completion_threshold);
    setLimit(challenge.participant_limit ? String(challenge.participant_limit) : '');
    setImageUrl(challenge.cover_image_url);
    setTasks(
      existingTasks.map((task) => ({
        id: task.id,
        name: task.name,
        frequency: task.frequency,
        target_count: task.target_count,
        is_required: task.is_required,
        requires_proof: task.requires_proof,
      })),
    );
  }, [isEdit, challenge, existingTasks, loadingTasks]);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const validTasks = tasks.filter((task) => task.name.trim().length > 0);
  const canSubmit =
    name.trim().length >= 3 &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    endDate >= startDate &&
    validTasks.length > 0 &&
    !isPending &&
    !uploading;

  async function handlePickImage(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setUploading(true);
    try {
      const url = await uploadAsset(file, `challenge-${Date.now()}.jpg`, file.type || 'image/jpeg', 'onlyfit-avatar');
      setImageUrl(url);
    } catch {
      setFeedback(t('challenges.form.imageError'));
    } finally {
      setUploading(false);
    }
  }

  function updateTask(index: number, patch: Partial<ChallengeTaskDraft>) {
    setTasks((current) => current.map((task, i) => (i === index ? { ...task, ...patch } : task)));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setFeedback(null);
    const input: ChallengeInput = {
      name: name.trim(),
      description: description.trim(),
      rules_text: rules.trim(),
      cover_image_url: imageUrl,
      category,
      start_at: new Date(`${startDate}T00:00:00`).toISOString(),
      end_at: new Date(`${endDate}T23:59:59`).toISOString(),
      visibility,
      participant_limit: limit ? Math.max(1, Number(limit)) : null,
      completion_threshold: threshold,
    };
    try {
      if (isEdit && challengeId) {
        await updateMutation.mutateAsync({ input, tasks: validTasks, existingTasks });
        navigate(`/desafios/${challengeId}`, { replace: true });
      } else {
        const created = await createMutation.mutateAsync({ input, tasks: validTasks });
        navigate(`/desafios/${created.id}`, { replace: true });
      }
    } catch {
      setFeedback(t('challenges.form.saveError'));
    }
  }

  if (isEdit && (loadingChallenge || loadingTasks)) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" aria-label={t('challenges.loading')} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar
        title={isEdit ? t('challenges.form.editTitle') : t('challenges.form.createTitle')}
        backFallback="/desafios"
      />

      <main className="mx-auto w-full max-w-[640px] space-y-6 px-4 pb-8 pt-4">
        {/* Imagem */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            aria-label={t('challenges.form.imageLabel')}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus size={26} aria-hidden />
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55">
                <Loader2 size={20} className="animate-spin text-white" aria-hidden />
              </span>
            )}
          </button>
          <div className="min-w-0">
            <p className="font-sans text-body font-medium text-on-surface">{t('challenges.form.imageLabel')}</p>
            <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{t('challenges.form.imageHint')}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => void handlePickImage(event.target.files?.[0])}
          />
        </div>

        <TextField
          label={t('challenges.form.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder={t('challenges.form.namePlaceholder')}
        />

        <TextAreaField
          label={t('challenges.form.description')}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={600}
          placeholder={t('challenges.form.descriptionPlaceholder')}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('challenges.form.startDate')}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <TextField
            label={t('challenges.form.endDate')}
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        {/* Checklist */}
        <fieldset>
          <legend className="mb-1.5 block font-sans text-body-sm font-medium text-on-surface-variant">
            {t('challenges.form.checklist')}
          </legend>
          <p className="mb-3 font-sans text-body-sm text-on-surface-variant">{t('challenges.form.checklistHint')}</p>
          <div className="space-y-3">
            {tasks.map((task, index) => (
              <div key={task.id ?? `draft-${index}`} className="space-y-3 rounded-2xl bg-surface-container p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField
                      label={t('challenges.form.taskName')}
                      id={`task-name-${index}`}
                      value={task.name}
                      onChange={(event) => updateTask(index, { name: event.target.value })}
                      maxLength={160}
                      placeholder={t('challenges.form.taskNamePlaceholder')}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTasks((current) => current.filter((_, i) => i !== index))}
                    className="mt-7 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={t('challenges.form.removeTask')}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label={t('challenges.form.taskFrequency')}
                    id={`task-frequency-${index}`}
                    value={task.frequency}
                    onChange={(value) => updateTask(index, { frequency: value as ChallengeFrequency })}
                    options={FREQUENCIES.map((frequency) => ({ value: frequency, label: t(frequencyKey(frequency)) }))}
                  />
                  <TextField
                    label={t('challenges.form.taskTarget')}
                    id={`task-target-${index}`}
                    type="number"
                    min={1}
                    max={99}
                    value={String(task.target_count)}
                    onChange={(event) =>
                      updateTask(index, { target_count: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <TaskToggle
                    checked={task.is_required}
                    label={t('challenges.form.taskRequired')}
                    onToggle={() => updateTask(index, { is_required: !task.is_required })}
                  />
                  <TaskToggle
                    checked={task.requires_proof}
                    label={t('challenges.form.taskProof')}
                    onToggle={() => updateTask(index, { requires_proof: !task.requires_proof })}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              setTasks((current) => [
                ...current,
                { name: '', frequency: 'daily', target_count: 1, is_required: true, requires_proof: false },
              ])
            }
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-outline-variant/60 font-sans text-label text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus size={16} aria-hidden />
            {t('challenges.form.addTask')}
          </button>
        </fieldset>

        {/* Visibilidade */}
        <fieldset>
          <legend className="mb-1.5 block font-sans text-body-sm font-medium text-on-surface-variant">
            {t('challenges.form.visibility')}
          </legend>
          <div className="grid grid-cols-1 gap-2">
            <VisibilityOption
              checked={visibility === 'public'}
              title={t('challenges.public')}
              description={t('challenges.form.publicHint')}
              onSelect={() => setVisibility('public')}
            />
            <VisibilityOption
              checked={visibility === 'private'}
              title={t('challenges.private')}
              description={t('challenges.form.privateHint')}
              onSelect={() => setVisibility('private')}
            />
          </div>
        </fieldset>

        {/* Categoria */}
        <fieldset>
          <legend className="mb-1.5 block font-sans text-body-sm font-medium text-on-surface-variant">
            {t('challenges.form.category')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const active = category === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => setCategory(active ? null : group.key)}
                  aria-pressed={active}
                  className={clsx(
                    'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                  )}
                >
                  {active && <Check size={15} strokeWidth={3} aria-hidden />}
                  {labelFor(group.key)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <SelectField
          label={t('challenges.form.threshold')}
          hint={t('challenges.form.thresholdHint')}
          value={String(threshold)}
          onChange={(value) => setThreshold(Number(value))}
          options={THRESHOLDS.map((value) => ({
            value: String(value),
            label: t('challenges.form.thresholdOption').replace('{percent}', String(value)),
          }))}
        />

        <TextField
          label={t('challenges.form.limit')}
          type="number"
          min={1}
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          hint={t('challenges.form.limitHint')}
          placeholder={t('challenges.form.limitPlaceholder')}
        />

        <TextAreaField
          label={t('challenges.form.rules')}
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          maxLength={2000}
          hint={t('challenges.form.rulesHint')}
        />

        {feedback && (
          <p role="alert" className="font-sans text-body-sm text-error">
            {feedback}
          </p>
        )}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {isEdit ? t('challenges.form.save') : t('challenges.form.create')}
        </button>
      </main>
    </div>
  );
}

function TaskToggle({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={clsx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        checked
          ? 'bg-primary/15 text-primary'
          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
      )}
    >
      {checked && <Check size={14} strokeWidth={3} aria-hidden />}
      {label}
    </button>
  );
}

function VisibilityOption({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={clsx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        checked
          ? 'border-primary bg-primary/5'
          : 'border-outline-variant/50 bg-surface-container-low hover:bg-surface-container',
      )}
    >
      <span
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant',
        )}
      >
        {checked && <Check size={12} strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block font-sans text-body font-medium text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{description}</span>
      </span>
    </button>
  );
}
