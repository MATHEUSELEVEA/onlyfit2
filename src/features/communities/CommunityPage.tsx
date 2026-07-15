import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Check,
  ChevronRight,
  Globe2,
  ListTodo,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MessageSquareText,
  PencilLine,
  Pin,
  Plus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { TextAreaField, TextField } from '@/components/ui/TextField';
import { useAffinityGroups } from '@/lib/sports';
import { CommunityAvatar } from './CommunitiesPage';
import { useDeleteCommunity } from './useCommunities';
import {
  useBanMember,
  useCommunity,
  useCommunityMembers,
  useJoinCommunity,
  useJoinRequests,
  useLeaveCommunity,
  useMyMembership,
  useReviewJoinRequest,
} from './useCommunity';
import { useCreateTopic, useTopics } from './useForum';
import type { Community, MemberProfile, MembershipStatus, Topic } from './types';

type Tab = 'forum' | 'announcements' | 'members' | 'requests' | 'about';

export function CommunityPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { communityId } = useParams<{ communityId: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data: community, isLoading } = useCommunity(communityId);
  const { data: membership = 'none' } = useMyMembership(community, userId);
  const [tab, setTab] = useState<Tab>('forum');

  const isOwner = membership === 'owner';
  const canSeeContent =
    isOwner || membership === 'member' || (community?.visibility === 'public' && membership !== 'banned');

  const { data: joinRequests = [] } = useJoinRequests(communityId, isOwner);
  const deleteMutation = useDeleteCommunity(communityId ?? '');

  if (isLoading || !community) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        {isLoading ? (
          <Loader2 size={28} className="animate-spin text-primary" aria-label={t('communities.loading')} />
        ) : (
          <p className="font-sans text-body text-on-surface-variant">{t('communities.notFound')}</p>
        )}
      </div>
    );
  }

  async function handleDelete() {
    if (!window.confirm(t('communities.deleteConfirm'))) return;
    try {
      await deleteMutation.mutateAsync();
      navigate('/comunidades', { replace: true });
    } catch {
      window.alert(t('communities.deleteError'));
    }
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'forum', label: t('communities.tab.forum') },
    { key: 'announcements', label: t('communities.tab.announcements') },
    { key: 'members', label: t('communities.tab.members') },
    ...(isOwner && community.visibility === 'private'
      ? [{ key: 'requests' as Tab, label: t('communities.tab.requests'), badge: joinRequests.length }]
      : []),
    { key: 'about', label: t('communities.tab.about') },
  ];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar title={community.name ?? t('communities.title')} backFallback="/comunidades" />

      <main className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-4">
        <CommunityHeader community={community} membership={membership} userId={userId} />

        {isOwner && (
          <div className="mt-3 flex gap-2">
            <Link
              to={`/comunidades/${community.id}/editar`}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-container-high px-4 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <PencilLine size={16} aria-hidden />
              {t('communities.edit')}
            </Link>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-error-container px-4 font-sans text-label text-on-error-container transition-colors hover:bg-error-container/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error disabled:opacity-60"
            >
              {deleteMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Trash2 size={16} aria-hidden />
              )}
              {t('communities.delete')}
            </button>
          </div>
        )}

        <div role="tablist" aria-label={community.name ?? undefined} className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-surface-container-low p-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={clsx(
                'relative inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                tab === item.key
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
              )}
            >
              {item.label}
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-sans text-nav font-bold text-on-primary">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <section className="mt-4">
          {tab === 'about' ? (
            <AboutTab community={community} />
          ) : tab === 'requests' && isOwner ? (
            <RequestsTab communityId={community.id} />
          ) : !canSeeContent ? (
            <PrivateGate membership={membership} />
          ) : tab === 'forum' ? (
            <ForumTab community={community} userId={userId} isOwner={isOwner} isMemberOrOwner={isOwner || membership === 'member'} />
          ) : tab === 'announcements' ? (
            <AnnouncementsTab community={community} userId={userId} isOwner={isOwner} />
          ) : (
            <MembersTab community={community} isOwner={isOwner} userId={userId} />
          )}
        </section>
      </main>
    </div>
  );
}

function CommunityHeader({
  community,
  membership,
  userId,
}: {
  community: Community;
  membership: MembershipStatus;
  userId: string | undefined;
}) {
  const { t } = useTranslation();
  const joinMutation = useJoinCommunity(community.id);
  const leaveMutation = useLeaveCommunity(community.id, userId);
  const memberCount = community.member_count ?? 0;

  const meta = [
    community.visibility === 'private' ? t('communities.private') : t('communities.public'),
    t(memberCount === 1 ? 'communities.memberCountOne' : 'communities.memberCount').replace('{count}', String(memberCount)),
  ].join(' · ');

  function actionButton() {
    if (membership === 'owner') return null;
    if (membership === 'banned') {
      return (
        <p role="status" className="font-sans text-body-sm text-error">
          {t('communities.bannedNotice')}
        </p>
      );
    }
    if (membership === 'member') {
      return (
        <button
          type="button"
          disabled={leaveMutation.isPending}
          onClick={() => {
            if (window.confirm(t('communities.leaveConfirm'))) leaveMutation.mutate();
          }}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-surface-container-high px-5 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {leaveMutation.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <LogOut size={16} aria-hidden />}
          {t('communities.leave')}
        </button>
      );
    }
    if (membership === 'pending') {
      return (
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-surface-container px-5 font-sans text-label text-on-surface-variant">
          {t('communities.requestPending')}
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={joinMutation.isPending}
        onClick={() => joinMutation.mutate()}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      >
        {joinMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {community.visibility === 'private' ? t('communities.requestJoin') : t('communities.join')}
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-surface-container p-4">
      <div className="flex items-center gap-4">
        <CommunityAvatar name={community.name} imageUrl={community.image_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate font-sans text-title-lg text-on-surface">{community.name}</h2>
            {community.visibility === 'private' ? (
              <Lock size={15} className="shrink-0 text-on-surface-variant" aria-hidden />
            ) : (
              <Globe2 size={15} className="shrink-0 text-on-surface-variant" aria-hidden />
            )}
          </div>
          <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">{meta}</p>
        </div>
      </div>
      {community.description && (
        <p className="mt-3 font-sans text-body-sm text-on-surface-variant">{community.description}</p>
      )}
      <div className="mt-4">{actionButton()}</div>
    </div>
  );
}

function PrivateGate({ membership }: { membership: MembershipStatus }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container px-4 py-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
        <Lock size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-body font-semibold text-on-surface">{t('communities.privateGateTitle')}</h3>
        <p className="mt-1 max-w-[46ch] font-sans text-body-sm text-on-surface-variant">
          {membership === 'banned' ? t('communities.bannedNotice') : t('communities.privateGateDescription')}
        </p>
      </div>
    </div>
  );
}

function ForumTab({
  community,
  userId,
  isOwner,
  isMemberOrOwner,
}: {
  community: Community;
  userId: string | undefined;
  isOwner: boolean;
  isMemberOrOwner: boolean;
}) {
  const { t } = useTranslation();
  const { data: topics = [], isLoading, isError } = useTopics(community.id, 'forum');
  const [composing, setComposing] = useState(false);

  const canPost = isMemberOrOwner || community.visibility === 'public';

  return (
    <div className="space-y-3">
      {canPost &&
        (composing ? (
          <TopicComposer
            community={community}
            userId={userId}
            allowPoll
            kind="text"
            onDone={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 font-sans text-label text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus size={16} aria-hidden />
            {t('communities.forum.newTopic')}
          </button>
        ))}

      {isLoading ? (
        <p className="px-1 py-4 font-sans text-body-sm text-on-surface-variant">{t('communities.loading')}</p>
      ) : isError ? (
        <p role="alert" className="px-1 py-4 font-sans text-body-sm text-error">
          {t('communities.loadError')}
        </p>
      ) : topics.length === 0 ? (
        <EmptyHint icon={MessageSquareText} text={t('communities.forum.empty')} />
      ) : (
        <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
          {topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} isOwner={isOwner} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementsTab({
  community,
  userId,
  isOwner,
}: {
  community: Community;
  userId: string | undefined;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const { data: topics = [], isLoading, isError } = useTopics(community.id, 'announcement');
  const [composing, setComposing] = useState(false);

  return (
    <div className="space-y-3">
      {isOwner &&
        (composing ? (
          <TopicComposer
            community={community}
            userId={userId}
            allowPoll={false}
            kind="announcement"
            onDone={() => setComposing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 font-sans text-label text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus size={16} aria-hidden />
            {t('communities.announcements.new')}
          </button>
        ))}

      {isLoading ? (
        <p className="px-1 py-4 font-sans text-body-sm text-on-surface-variant">{t('communities.loading')}</p>
      ) : isError ? (
        <p role="alert" className="px-1 py-4 font-sans text-body-sm text-error">
          {t('communities.loadError')}
        </p>
      ) : topics.length === 0 ? (
        <EmptyHint icon={Megaphone} text={t('communities.announcements.empty')} />
      ) : (
        <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
          {topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} isOwner={isOwner} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Composer de tópico/aviso; enquete é um tópico com opções de voto. */
function TopicComposer({
  community,
  userId,
  allowPoll,
  kind,
  onDone,
}: {
  community: Community;
  userId: string | undefined;
  allowPoll: boolean;
  kind: 'text' | 'announcement';
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const createMutation = useCreateTopic(community.id, userId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [withPoll, setWithPoll] = useState(false);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [feedback, setFeedback] = useState<string | null>(null);

  const validOptions = options.map((option) => option.trim()).filter(Boolean);
  const canSubmit =
    title.trim().length >= 3 && !createMutation.isPending && (!withPoll || validOptions.length >= 2);

  async function handleSubmit() {
    if (!canSubmit) return;
    setFeedback(null);
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        kind: withPoll ? 'poll' : kind,
        pollOptions: withPoll ? validOptions : undefined,
      });
      onDone();
    } catch {
      setFeedback(t('communities.forum.createError'));
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-surface-container p-4">
      <TextField
        label={kind === 'announcement' ? t('communities.announcements.titleLabel') : t('communities.forum.titleLabel')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={140}
      />
      <TextAreaField
        label={t('communities.forum.bodyLabel')}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={4000}
      />

      {allowPoll && (
        <div>
          <button
            type="button"
            aria-pressed={withPoll}
            onClick={() => setWithPoll((current) => !current)}
            className={clsx(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              withPoll
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
            )}
          >
            <ListTodo size={16} aria-hidden />
            {t('communities.poll.attach')}
          </button>

          {withPoll && (
            <div className="mt-3 space-y-2">
              {options.map((option, index) => (
                <TextField
                  key={index}
                  label={t('communities.poll.optionLabel').replace('{number}', String(index + 1))}
                  value={option}
                  onChange={(event) =>
                    setOptions((current) => current.map((item, i) => (i === index ? event.target.value : item)))
                  }
                  maxLength={120}
                />
              ))}
              {options.length < 6 && (
                <button
                  type="button"
                  onClick={() => setOptions((current) => [...current, ''])}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 font-sans text-label text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Plus size={15} aria-hidden />
                  {t('communities.poll.addOption')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {feedback && (
        <p role="alert" className="font-sans text-body-sm text-error">
          {feedback}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-surface-container-high px-5 font-sans text-label text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('communities.cancel')}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
        >
          {createMutation.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('communities.forum.publish')}
        </button>
      </div>
    </div>
  );
}

function TopicRow({ topic, isOwner }: { topic: Topic; isOwner: boolean }) {
  const { t } = useTranslation();
  const authorName = topic.author?.full_name || topic.author?.username || t('communities.memberFallback');
  const meta = [
    authorName,
    t(topic.reply_count === 1 ? 'communities.forum.replyCountOne' : 'communities.forum.replyCount').replace(
      '{count}',
      String(topic.reply_count),
    ),
  ].join(' · ');

  return (
    <Link
      to={`/comunidades/${topic.community_id}/topicos/${topic.id}`}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {topic.is_pinned && <Pin size={14} className="shrink-0 text-primary" aria-label={t('communities.forum.pinned')} />}
          {topic.post_kind === 'poll' && (
            <ListTodo size={14} className="shrink-0 text-primary" aria-label={t('communities.poll.badge')} />
          )}
          {topic.is_closed && <Lock size={14} className="shrink-0 text-on-surface-variant" aria-label={t('communities.forum.closed')} />}
          <h3 className="truncate font-sans text-body font-medium text-on-surface">
            {topic.title || topic.body || t('communities.forum.untitled')}
          </h3>
        </div>
        <p className="mt-0.5 truncate font-sans text-body-sm text-on-surface-variant">{meta}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
      {isOwner && <span className="sr-only">{t('communities.moderation.hint')}</span>}
    </Link>
  );
}

function MembersTab({
  community,
  isOwner,
  userId,
}: {
  community: Community;
  isOwner: boolean;
  userId: string | undefined;
}) {
  const { t } = useTranslation();
  const { data: members = [], isLoading, isError } = useCommunityMembers(community.id, true);
  const banMutation = useBanMember(community.id);

  function handleBan(memberId: string, name: string) {
    if (!window.confirm(t('communities.moderation.banConfirm').replace('{name}', name))) return;
    banMutation.mutate({ userId: memberId });
  }

  if (isLoading) return <p className="px-1 py-4 font-sans text-body-sm text-on-surface-variant">{t('communities.loading')}</p>;
  if (isError)
    return (
      <p role="alert" className="px-1 py-4 font-sans text-body-sm text-error">
        {t('communities.loadError')}
      </p>
    );
  if (members.length === 0) return <EmptyHint icon={UserRound} text={t('communities.members.empty')} />;

  return (
    <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
      {members.map((member) => {
        const name = member.profile?.full_name || member.profile?.username || t('communities.memberFallback');
        return (
          <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
            <MemberAvatar profile={member.profile} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-body font-medium text-on-surface">{name}</p>
              {member.profile?.username && (
                <p className="truncate font-sans text-body-sm text-on-surface-variant">@{member.profile.username}</p>
              )}
            </div>
            {isOwner && member.user_id !== userId && (
              <button
                type="button"
                disabled={banMutation.isPending}
                onClick={() => handleBan(member.user_id, name)}
                className="inline-flex min-h-9 items-center rounded-lg px-3 font-sans text-label text-error transition-colors hover:bg-error-container/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error disabled:opacity-60"
              >
                {t('communities.moderation.ban')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequestsTab({ communityId }: { communityId: string }) {
  const { t } = useTranslation();
  const { data: requests = [], isLoading, isError } = useJoinRequests(communityId, true);
  const reviewMutation = useReviewJoinRequest(communityId);

  if (isLoading) return <p className="px-1 py-4 font-sans text-body-sm text-on-surface-variant">{t('communities.loading')}</p>;
  if (isError)
    return (
      <p role="alert" className="px-1 py-4 font-sans text-body-sm text-error">
        {t('communities.loadError')}
      </p>
    );
  if (requests.length === 0) return <EmptyHint icon={UserRound} text={t('communities.requests.empty')} />;

  return (
    <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
      {requests.map((request) => {
        const name = request.requester?.full_name || request.requester?.username || t('communities.memberFallback');
        const isActing = reviewMutation.isPending && reviewMutation.variables?.requestId === request.id;
        return (
          <div key={request.id} className="flex items-center gap-3 px-4 py-3">
            <MemberAvatar profile={request.requester} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-sans text-body font-medium text-on-surface">{name}</p>
              {request.requester?.username && (
                <p className="truncate font-sans text-body-sm text-on-surface-variant">@{request.requester.username}</p>
              )}
            </div>
            <button
              type="button"
              disabled={isActing}
              aria-label={t('communities.requests.reject')}
              onClick={() => reviewMutation.mutate({ requestId: request.id, approve: false })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              <X size={17} aria-hidden />
            </button>
            <button
              type="button"
              disabled={isActing}
              aria-label={t('communities.requests.approve')}
              onClick={() => reviewMutation.mutate({ requestId: request.id, approve: true })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
            >
              {isActing ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={17} aria-hidden />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AboutTab({ community }: { community: Community }) {
  const { t } = useTranslation();
  const { labelFor } = useAffinityGroups();
  const categories = (community.sports ?? []).map(labelFor).join(', ');

  return (
    <div className="space-y-4 rounded-2xl bg-surface-container p-4">
      <AboutBlock title={t('communities.about.description')}>
        {community.description || t('communities.about.emptyValue')}
      </AboutBlock>
      <AboutBlock title={t('communities.about.rules')}>
        {community.rules_text || t('communities.about.emptyValue')}
      </AboutBlock>
      <AboutBlock title={t('communities.form.category')}>{categories || t('communities.about.emptyValue')}</AboutBlock>
      <AboutBlock title={t('communities.about.visibility')}>
        {community.visibility === 'private' ? t('communities.form.privateHint') : t('communities.form.publicHint')}
      </AboutBlock>
    </div>
  );
}

function AboutBlock({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <h3 className="font-sans text-label text-on-surface">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap font-sans text-body-sm text-on-surface-variant">{children}</p>
    </div>
  );
}

export function MemberAvatar({ profile }: { profile: MemberProfile | null }) {
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
      <UserRound size={18} aria-hidden />
    </span>
  );
}

function EmptyHint({ icon: Icon, text }: { icon: typeof UserRound; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-container px-4 py-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
        <Icon size={19} aria-hidden />
      </span>
      <p className="font-sans text-body-sm text-on-surface-variant">{text}</p>
    </div>
  );
}
