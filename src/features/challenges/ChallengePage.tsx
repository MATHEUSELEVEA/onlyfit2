import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { CalendarDays, Globe2, Loader2, Lock, Pencil, UsersRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useAffinityGroups } from '@/lib/sports';
import {
  useChallenge,
  useChallengeCreator,
  useJoinChallenge,
  useLeaveChallenge,
  useMyChallengeMembership,
} from './useChallenge';
import { ChallengeChecklist } from './ChallengeChecklist';
import { ChallengeFeed } from './ChallengeFeed';
import { ChallengeRanking } from './ChallengeRanking';
import { ChallengeManage } from './ChallengeManage';
import { ChallengeCover } from './ChallengesPage';
import { challengeStatusKey, displayName, formatDateRange } from './format';
import type { ChallengeProfile, ChallengeRun } from './types';

type Tab = 'checklist' | 'feed' | 'ranking' | 'about' | 'manage';

export function ChallengePage() {
  const { t } = useTranslation();
  const { challengeId } = useParams<{ challengeId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data: run, isLoading } = useChallenge(challengeId);
  const { data: creator } = useChallengeCreator(run?.creator_id);
  const membership = useMyChallengeMembership(run, userId);
  const join = useJoinChallenge(challengeId);
  const [tab, setTab] = useState<Tab>('checklist');
  const [joinNotice, setJoinNotice] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 size={28} className="animate-spin text-primary" aria-label={t('challenges.loading')} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="h-full overflow-y-auto bg-background">
        <PageTopBar title={t('challenges.title')} backFallback="/desafios" />
        <p className="px-4 py-8 font-sans text-body text-on-surface-variant">{t('challenges.notFound')}</p>
      </div>
    );
  }

  const status = membership.data ?? 'none';
  const isOwner = status === 'owner';
  const isMember = status === 'member';
  const isPrivate = run.access_audience === 'invite_only';

  async function handleJoin() {
    setJoinNotice(null);
    try {
      const result = await join.mutateAsync(undefined);
      if (result === 'requested') setJoinNotice(t('challenges.join.requested'));
      else if (result === 'full') setJoinNotice(t('challenges.join.full'));
      else if (result === 'closed') setJoinNotice(t('challenges.join.closed'));
      else if (result === 'ended') setJoinNotice(t('challenges.join.ended'));
    } catch {
      setJoinNotice(t('challenges.join.error'));
    }
  }

  const tabs: { key: Tab; label: TranslationKey }[] = [
    { key: 'checklist', label: 'challenges.tab.checklist' },
    { key: 'feed', label: 'challenges.tab.feed' },
    { key: 'ranking', label: 'challenges.tab.ranking' },
    { key: 'about', label: 'challenges.tab.about' },
    ...(isOwner ? ([{ key: 'manage', label: 'challenges.tab.manage' }] as const) : []),
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar
        title={run.name}
        backFallback="/desafios"
        actions={
          isOwner ? (
            <Link
              to={`/desafios/${run.id}/editar`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-container-high px-4 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Pencil size={15} aria-hidden />
              {t('challenges.edit')}
            </Link>
          ) : undefined
        }
      />

      <main className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-4">
        <Header run={run} creator={creator} creatorName={displayName(creator ?? null, t('challenges.creatorFallback'))} />

        {/* CTA de participação */}
        {!isOwner && !isMember && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={join.isPending || status === 'pending' || membership.isLoading}
              onClick={() => void handleJoin()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {join.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {status === 'pending'
                ? t('challenges.join.pending')
                : isPrivate
                  ? t('challenges.join.request')
                  : t('challenges.join.join')}
            </button>
            {status === 'pending' && <CancelRequestButton runId={run.id} />}
            {joinNotice && <p className="font-sans text-body-sm text-on-surface-variant">{joinNotice}</p>}
          </div>
        )}

        {/* Abas */}
        <div role="tablist" aria-label={run.name} className="mt-5 grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-container-low p-1">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              id={`tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={clsx(
                'inline-flex min-h-10 items-center justify-center rounded-lg px-1 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                tab === key
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <section role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4">
          {tab === 'checklist' && <ChallengeChecklist run={run} isParticipant={isMember} />}
          {tab === 'feed' && <ChallengeFeed run={run} userId={userId} isParticipant={isMember} isOwner={isOwner} />}
          {tab === 'ranking' && <ChallengeRanking run={run} />}
          {tab === 'about' && (
            <AboutTab
              run={run}
              creator={creator}
              creatorName={displayName(creator ?? null, t('challenges.creatorFallback'))}
              isMember={isMember}
            />
          )}
          {tab === 'manage' && isOwner && <ChallengeManage run={run} userId={userId} />}
        </section>
      </main>
    </div>
  );
}

function Header({
  run,
  creator,
  creatorName,
}: {
  run: ChallengeRun;
  creator: ChallengeProfile | null | undefined;
  creatorName: string;
}) {
  const { t } = useTranslation();
  const { labelFor } = useAffinityGroups();
  const isPrivate = run.access_audience === 'invite_only';

  return (
    <div className="flex items-start gap-4">
      <ChallengeCover name={run.name} imageUrl={run.cover_image_url} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="min-w-0 truncate font-sans text-title-lg text-on-surface">{run.name}</h2>
          {isPrivate ? (
            <Lock size={15} className="shrink-0 text-on-surface-variant" aria-label={t('challenges.private')} />
          ) : (
            <Globe2 size={15} className="shrink-0 text-on-surface-variant" aria-label={t('challenges.public')} />
          )}
        </div>
        <CreatorByline creator={creator} creatorName={creatorName} />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-body-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={14} aria-hidden />
            {formatDateRange(run.start_at, run.end_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <UsersRound size={14} aria-hidden />
            {t(
              run.participant_count === 1 ? 'challenges.collective.participantsOne' : 'challenges.collective.participants',
            ).replace('{count}', String(run.participant_count))}
          </span>
          <span className="text-primary">{t(challengeStatusKey(run))}</span>
          {run.category && <span>{labelFor(run.category)}</span>}
        </div>
      </div>
    </div>
  );
}

function CreatorByline({
  creator,
  creatorName,
}: {
  creator: ChallengeProfile | null | undefined;
  creatorName: string;
}) {
  const { t } = useTranslation();
  const label = t('challenges.byCreator').replace('{name}', creatorName);

  if (!creator?.username) {
    return <p className="mt-0.5 truncate font-sans text-body-sm text-on-surface-variant">{label}</p>;
  }

  return (
    <Link
      to={`/creator/${encodeURIComponent(creator.username)}`}
      aria-label={`Ver perfil de @${creator.username}`}
      className="mt-0.5 flex min-w-0 items-center gap-1.5 self-start truncate font-sans text-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
    >
      {creator.avatar_url ? (
        <img src={creator.avatar_url} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
      ) : null}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function CancelRequestButton({ runId }: { runId: string }) {
  const { t } = useTranslation();
  const leave = useLeaveChallenge(runId);
  return (
    <button
      type="button"
      disabled={leave.isPending}
      onClick={() => leave.mutate()}
      className="inline-flex min-h-10 w-full items-center justify-center rounded-xl font-sans text-label text-on-surface-variant transition-colors hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
    >
      {t('challenges.join.cancelRequest')}
    </button>
  );
}

function AboutTab({
  run,
  creator,
  creatorName,
  isMember,
}: {
  run: ChallengeRun;
  creator: ChallengeProfile | null | undefined;
  creatorName: string;
  isMember: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const leave = useLeaveChallenge(run.id);
  const rules = run.rules_json?.text;

  async function handleLeave() {
    if (!window.confirm(t('challenges.leaveConfirm'))) return;
    await leave.mutateAsync();
    navigate('/desafios', { replace: true });
  }

  return (
    <div className="space-y-4">
      {run.description && (
        <AboutSection title={t('challenges.about.objective')}>
          <p className="whitespace-pre-wrap font-sans text-body text-on-surface">{run.description}</p>
        </AboutSection>
      )}
      {rules && (
        <AboutSection title={t('challenges.about.rules')}>
          <p className="whitespace-pre-wrap font-sans text-body text-on-surface">{rules}</p>
        </AboutSection>
      )}
      <AboutSection title={t('challenges.about.completion')}>
        <p className="font-sans text-body text-on-surface">
          {t('challenges.about.completionRule').replace('{percent}', String(run.completion_threshold))}
        </p>
      </AboutSection>
      <AboutSection title={t('challenges.about.creator')}>
        {creator?.username ? (
          <Link
            to={`/creator/${encodeURIComponent(creator.username)}`}
            aria-label={`Ver perfil de @${creator.username}`}
            className="inline-flex items-center gap-2 font-sans text-body text-on-surface transition-colors hover:text-primary"
          >
            {creator.avatar_url ? (
              <img src={creator.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : null}
            {creatorName}
          </Link>
        ) : (
          <p className="font-sans text-body text-on-surface">{creatorName}</p>
        )}
      </AboutSection>

      {isMember && (
        <button
          type="button"
          disabled={leave.isPending}
          onClick={() => void handleLeave()}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-outline-variant/50 font-sans text-label text-error transition-colors hover:bg-error-container/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {t('challenges.leave')}
        </button>
      )}
    </div>
  );
}

function AboutSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface-container p-4">
      <h3 className="mb-1.5 font-sans text-body-sm font-medium text-on-surface-variant">{title}</h3>
      {children}
    </section>
  );
}
