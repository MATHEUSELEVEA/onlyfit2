import { useState } from 'react';
import { clsx } from 'clsx';
import { Camera, Check, Flame, Loader2, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { uploadAsset } from '@/features/studio/upload';
import { useCompleteTask, useMyChallengeProgress, useUncompleteTask } from './useChecklist';
import { formatDate, frequencyPeriodKey } from './format';
import type { ChallengeRun, MyChallengeProgress, ProgressTask } from './types';

export function ChallengeChecklist({ run, isParticipant }: { run: ChallengeRun; isParticipant: boolean }) {
  const { t } = useTranslation();
  const progress = useMyChallengeProgress(run.id);
  const complete = useCompleteTask(run.id);
  const uncomplete = useUncompleteTask(run.id);
  const [proofTask, setProofTask] = useState<ProgressTask | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (progress.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={24} className="animate-spin text-primary" aria-label={t('challenges.loading')} />
      </div>
    );
  }
  if (progress.isError || !progress.data) {
    return (
      <p role="alert" className="px-1 py-6 font-sans text-body text-error">
        {t('challenges.loadError')}
      </p>
    );
  }

  const data = progress.data;
  const started = data.today >= data.start_date;
  const ended = data.today > data.end_date;

  async function handleComplete(task: ProgressTask, proofUrl?: string | null, proofText?: string | null) {
    setFeedback(null);
    try {
      await complete.mutateAsync({ taskId: task.id, proofUrl, proofText });
      setProofTask(null);
    } catch {
      setFeedback(t('challenges.checklist.completeError'));
    }
  }

  async function handleUndo(task: ProgressTask) {
    if (!task.last_completion_id) return;
    setFeedback(null);
    try {
      await uncomplete.mutateAsync(task.last_completion_id);
    } catch {
      setFeedback(t('challenges.checklist.completeError'));
    }
  }

  return (
    <div className="space-y-4">
      {isParticipant && data.participant && <ProgressCard data={data} />}

      {!started && (
        <p className="rounded-2xl bg-surface-container px-4 py-3 font-sans text-body-sm text-on-surface-variant">
          {t('challenges.checklist.notStarted').replace('{date}', formatDate(run.start_at))}
        </p>
      )}

      {feedback && (
        <p role="alert" className="font-sans text-body-sm text-error">
          {feedback}
        </p>
      )}

      <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
        {data.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            canAct={isParticipant && started && !ended}
            pending={complete.isPending || uncomplete.isPending}
            onComplete={() => {
              if (task.requires_proof) {
                setProofTask(task);
              } else {
                void handleComplete(task);
              }
            }}
            onUndo={() => void handleUndo(task)}
          />
        ))}
        {data.tasks.length === 0 && (
          <p className="px-4 py-6 font-sans text-body-sm text-on-surface-variant">{t('challenges.checklist.empty')}</p>
        )}
      </div>

      <ProofSheet
        task={proofTask}
        pending={complete.isPending}
        onClose={() => setProofTask(null)}
        onSubmit={(proofUrl, proofText) => proofTask && void handleComplete(proofTask, proofUrl, proofText)}
      />
    </div>
  );
}

function ProgressCard({ data }: { data: MyChallengeProgress }) {
  const { t } = useTranslation();
  const participant = data.participant!;
  const adherence = participant.metadata?.adherence ?? 100;
  const bestStreak = participant.metadata?.best_streak ?? participant.streak_count;
  const onTrack = participant.metadata?.on_track ?? true;
  const completed = participant.status === 'completed';
  const percent = Math.round(Number(participant.progress_percent));

  return (
    <div className="space-y-3 rounded-2xl bg-surface-container p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-sans text-title-lg text-on-surface">
            {t('challenges.progress.percent').replace('{percent}', String(percent))}
          </p>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
            {completed
              ? t('challenges.progress.completed')
              : onTrack
                ? t('challenges.progress.onTrack').replace('{percent}', String(Math.round(Number(adherence))))
                : t('challenges.progress.recover')}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5">
          <Flame size={16} className="text-primary" aria-hidden />
          <span className="font-sans text-label text-on-surface">
            {t(participant.streak_count === 1 ? 'challenges.progress.streakOne' : 'challenges.progress.streak').replace(
              '{count}',
              String(participant.streak_count),
            )}
          </span>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 font-sans text-body-sm text-on-surface-variant">
        <span>
          {t(data.days_remaining === 1 ? 'challenges.progress.daysLeftOne' : 'challenges.progress.daysLeft').replace(
            '{count}',
            String(data.days_remaining),
          )}
        </span>
        <span>{t('challenges.progress.tasksDone').replace('{count}', String(participant.completion_count))}</span>
        <span>{t('challenges.progress.bestStreak').replace('{count}', String(bestStreak))}</span>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  canAct,
  pending,
  onComplete,
  onUndo,
}: {
  task: ProgressTask;
  canAct: boolean;
  pending: boolean;
  onComplete: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const done = task.done_in_period >= task.target_count;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={clsx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
          done ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-transparent',
        )}
        aria-hidden
      >
        <Check size={16} strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={clsx('font-sans text-body text-on-surface', done && 'line-through opacity-70')}>{task.name}</p>
        <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
          {[
            `${t(frequencyPeriodKey(task.frequency))}: ${task.done_in_period}/${task.target_count}`,
            task.is_required ? null : t('challenges.checklist.optional'),
            task.requires_proof ? t('challenges.checklist.proofRequired') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {canAct &&
        (done ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={pending || !task.last_completion_id}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            aria-label={t('challenges.checklist.undo')}
          >
            <RotateCcw size={17} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            disabled={pending}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {t('challenges.checklist.complete')}
          </button>
        ))}
    </div>
  );
}

function ProofSheet({
  task,
  pending,
  onClose,
  onSubmit,
}: {
  task: ProgressTask | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (proofUrl: string | null, proofText: string | null) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadAsset(file, `challenge-proof-${Date.now()}.jpg`, file.type || 'image/jpeg', 'onlyfit-media');
      setImageUrl(url);
    } catch {
      setError(t('challenges.form.imageError'));
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setText('');
    setImageUrl(null);
    setError(null);
  }

  return (
    <BottomSheet
      open={Boolean(task)}
      onClose={() => {
        reset();
        onClose();
      }}
      title={task?.name ?? ''}
    >
      <div className="space-y-4 px-4 pb-6">
        <p className="font-sans text-body-sm text-on-surface-variant">{t('challenges.checklist.proofHint')}</p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t('challenges.checklist.proofPlaceholder')}
          aria-label={t('challenges.checklist.proofPlaceholder')}
          className="w-full rounded-xl border border-outline-variant/50 bg-surface-container-low p-3.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-surface-container-high px-4 font-sans text-label text-on-surface-variant transition-colors hover:bg-surface-container-highest">
          <Camera size={17} aria-hidden />
          {imageUrl ? t('challenges.checklist.proofPhotoDone') : t('challenges.checklist.proofPhoto')}
          <input type="file" accept="image/*" className="hidden" onChange={(event) => void handlePick(event.target.files?.[0])} />
        </label>
        {imageUrl && <img src={imageUrl} alt="" className="max-h-44 rounded-xl object-cover" />}
        {error && (
          <p role="alert" className="font-sans text-body-sm text-error">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={pending || uploading || (!text.trim() && !imageUrl)}
          onClick={() => {
            onSubmit(imageUrl, text.trim() || null);
            reset();
          }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {(pending || uploading) && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('challenges.checklist.confirmComplete')}
        </button>
      </div>
    </BottomSheet>
  );
}
