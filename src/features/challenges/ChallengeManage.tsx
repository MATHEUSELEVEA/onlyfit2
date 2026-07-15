import { useNavigate } from 'react-router-dom';
import { Check, DoorClosed, DoorOpen, Loader2, OctagonX, Trash2, UserMinus, X } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { useDeleteChallenge } from './useChallenges';
import {
  useChallengeJoinRequests,
  useChallengeParticipants,
  useRemoveChallengeParticipant,
  useReviewChallengeRequest,
  useUpdateChallengeAdmin,
} from './useChallenge';
import { displayName } from './format';
import type { ChallengeProfile, ChallengeRun } from './types';

export function ChallengeManage({ run, userId }: { run: ChallengeRun; userId: string | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isPrivate = run.access_audience === 'invite_only';
  const requests = useChallengeJoinRequests(run.id, isPrivate);
  const participants = useChallengeParticipants(run.id, true);
  const review = useReviewChallengeRequest(run.id);
  const removeParticipant = useRemoveChallengeParticipant(run.id);
  const admin = useUpdateChallengeAdmin(run.id);
  const deleteChallenge = useDeleteChallenge(run.id);
  const ended = run.status === 'completed' || run.status === 'cancelled';

  async function handleEndNow() {
    if (!window.confirm(t('challenges.manage.endConfirm'))) return;
    await admin.mutateAsync({ end_at: new Date().toISOString() });
  }

  async function handleDelete() {
    if (!window.confirm(t('challenges.manage.deleteConfirm'))) return;
    await deleteChallenge.mutateAsync();
    navigate('/desafios', { replace: true });
  }

  return (
    <div className="space-y-5">
      {/* Ações do desafio */}
      <section className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
        <ManageAction
          icon={run.enrollment_closed ? DoorOpen : DoorClosed}
          title={run.enrollment_closed ? t('challenges.manage.openEnrollment') : t('challenges.manage.closeEnrollment')}
          description={t('challenges.manage.enrollmentHint')}
          disabled={admin.isPending || ended}
          onClick={() => void admin.mutateAsync({ enrollment_closed: !run.enrollment_closed })}
        />
        {!ended && (
          <ManageAction
            icon={OctagonX}
            title={t('challenges.manage.endNow')}
            description={t('challenges.manage.endHint')}
            disabled={admin.isPending}
            onClick={() => void handleEndNow()}
          />
        )}
        <ManageAction
          icon={Trash2}
          title={t('challenges.manage.delete')}
          description={t('challenges.manage.deleteHint')}
          disabled={deleteChallenge.isPending}
          destructive
          onClick={() => void handleDelete()}
        />
      </section>

      {/* Solicitações pendentes (desafio privado) */}
      {isPrivate && (
        <section>
          <h3 className="mb-2 px-1 font-sans text-body-sm font-medium text-on-surface-variant">
            {t('challenges.manage.requests')} · {(requests.data ?? []).length}
          </h3>
          {requests.isLoading ? (
            <LoadingRow />
          ) : (requests.data ?? []).length === 0 ? (
            <p className="rounded-2xl bg-surface-container px-4 py-4 font-sans text-body-sm text-on-surface-variant">
              {t('challenges.manage.noRequests')}
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
              {(requests.data ?? []).map((request) => (
                <div key={request.id} className="flex items-center gap-3 px-4 py-3">
                  <PersonAvatar profile={request.requester} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-body font-medium text-on-surface">
                      {displayName(request.requester, t('challenges.feed.participantFallback'))}
                    </p>
                    {request.request_message && (
                      <p className="mt-0.5 line-clamp-2 font-sans text-body-sm text-on-surface-variant">
                        {request.request_message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ requestId: request.id, approve: true })}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-60"
                    aria-label={t('challenges.manage.approve')}
                  >
                    <Check size={17} aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={review.isPending}
                    onClick={() => review.mutate({ requestId: request.id, approve: false })}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-container-highest disabled:opacity-60"
                    aria-label={t('challenges.manage.reject')}
                  >
                    <X size={17} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Participantes */}
      <section>
        <h3 className="mb-2 px-1 font-sans text-body-sm font-medium text-on-surface-variant">
          {t('challenges.manage.participants')} · {(participants.data ?? []).length}
        </h3>
        {participants.isLoading ? (
          <LoadingRow />
        ) : (participants.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-surface-container px-4 py-4 font-sans text-body-sm text-on-surface-variant">
            {t('challenges.manage.noParticipants')}
          </p>
        ) : (
          <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
            {(participants.data ?? []).map((participant) => (
              <div key={participant.user_id} className="flex items-center gap-3 px-4 py-3">
                <PersonAvatar profile={participant.profile} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-body font-medium text-on-surface">
                    {displayName(participant.profile, t('challenges.feed.participantFallback'))}
                  </p>
                  <p className="font-sans text-body-sm text-on-surface-variant">
                    {t('challenges.ranking.progress').replace(
                      '{percent}',
                      String(Math.round(Number(participant.progress_percent))),
                    )}
                  </p>
                </div>
                {participant.user_id !== userId && (
                  <button
                    type="button"
                    disabled={removeParticipant.isPending}
                    onClick={() => {
                      if (window.confirm(t('challenges.manage.removeConfirm'))) {
                        removeParticipant.mutate(participant.user_id);
                      }
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error disabled:opacity-60"
                    aria-label={t('challenges.manage.remove')}
                  >
                    <UserMinus size={17} aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ManageAction({
  icon: Icon,
  title,
  description,
  disabled,
  destructive,
  onClick,
}: {
  icon: typeof Check;
  title: string;
  description: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60"
    >
      <span
        className={
          destructive
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-error-container text-on-error-container'
            : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant'
        }
      >
        <Icon size={18} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={destructive ? 'block font-sans text-body font-medium text-error' : 'block font-sans text-body font-medium text-on-surface'}>
          {title}
        </span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">{description}</span>
      </span>
    </button>
  );
}

function PersonAvatar({ profile }: { profile: ChallengeProfile | null }) {
  const initial = (profile?.full_name || profile?.username || '?').charAt(0).toUpperCase();
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-label text-on-surface-variant">
      {initial}
    </span>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center rounded-2xl bg-surface-container py-6">
      <Loader2 size={20} className="animate-spin text-primary" aria-hidden />
    </div>
  );
}
