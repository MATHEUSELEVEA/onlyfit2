import { Flame, Loader2, UsersRound } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { useChallengeRanking, useCollectiveProgress } from './useChecklist';
import { displayName } from './format';
import type { ChallengeRun, CollectiveProgress, RankingRow } from './types';

// Grupos de progresso (spec): visão acolhedora em vez de pódio.
function groupKey(row: RankingRow): TranslationKey {
  if (row.completion_count === 0) return 'challenges.ranking.groupStarting';
  if (Number(row.adherence) >= 100) return 'challenges.ranking.groupOnTrack';
  if (Number(row.adherence) >= 70) return 'challenges.ranking.groupAlmost';
  return 'challenges.ranking.groupNeedsBoost';
}

const GROUP_ORDER: TranslationKey[] = [
  'challenges.ranking.groupOnTrack',
  'challenges.ranking.groupAlmost',
  'challenges.ranking.groupNeedsBoost',
  'challenges.ranking.groupStarting',
];

export function ChallengeRanking({ run }: { run: ChallengeRun }) {
  const { t } = useTranslation();
  const ranking = useChallengeRanking(run.id);
  const collective = useCollectiveProgress(run.id);

  if (ranking.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={24} className="animate-spin text-primary" aria-label={t('challenges.loading')} />
      </div>
    );
  }
  if (ranking.isError) {
    return (
      <p role="alert" className="px-1 py-6 font-sans text-body text-error">
        {t('challenges.loadError')}
      </p>
    );
  }

  const rows = ranking.data ?? [];
  const groups = GROUP_ORDER.map((key) => ({ key, rows: rows.filter((row) => groupKey(row) === key) })).filter(
    (group) => group.rows.length > 0,
  );

  return (
    <div className="space-y-4">
      {collective.data && <CollectiveCard data={collective.data} />}

      {rows.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl bg-surface-container px-4 py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
            <UsersRound size={19} aria-hidden />
          </span>
          <p className="font-sans text-body-sm text-on-surface-variant">{t('challenges.ranking.empty')}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h3 className="mb-2 px-1 font-sans text-body-sm font-medium text-on-surface-variant">
              {t(group.key)} · {group.rows.length}
            </h3>
            <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
              {group.rows.map((row) => (
                <RankingRowItem key={row.user_id} row={row} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function CollectiveCard({ data }: { data: CollectiveProgress }) {
  const { t } = useTranslation();
  const onTrackPercent = data.participant_count > 0 ? Math.round((data.on_track_count / data.participant_count) * 100) : 0;

  return (
    <div className="space-y-2 rounded-2xl bg-surface-container p-4">
      <p className="font-sans text-title text-on-surface">
        {t('challenges.collective.onTrack').replace('{percent}', String(onTrackPercent))}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${onTrackPercent}%` }} />
      </div>
      <p className="font-sans text-body-sm text-on-surface-variant">
        {[
          t(data.participant_count === 1 ? 'challenges.collective.participantsOne' : 'challenges.collective.participants').replace(
            '{count}',
            String(data.participant_count),
          ),
          t('challenges.collective.activities').replace('{count}', String(data.total_completions)),
          data.completed_count > 0
            ? t('challenges.collective.completed').replace('{count}', String(data.completed_count))
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}

function RankingRowItem({ row }: { row: RankingRow }) {
  const { t } = useTranslation();
  const name = displayName(row, t('challenges.feed.participantFallback'));
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {row.avatar_url ? (
        <img src={row.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-label text-on-surface-variant">
          {initial}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-sans text-body font-medium text-on-surface">{name}</p>
        <p className="font-sans text-body-sm text-on-surface-variant">
          {t('challenges.ranking.adherence').replace('{percent}', String(Math.round(Number(row.adherence))))}
        </p>
      </div>
      {row.streak_count > 0 && (
        <span className="flex shrink-0 items-center gap-1 font-sans text-body-sm text-on-surface-variant">
          <Flame size={14} className="text-primary" aria-hidden />
          {row.streak_count}
        </span>
      )}
    </div>
  );
}
