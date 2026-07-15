import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronRight, Globe2, Lock, Plus, Search, UsersRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n/I18nProvider';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { useDiscoverCommunities, useMyCommunities } from './useCommunities';
import type { Community } from './types';

type Tab = 'mine' | 'discover';

export function CommunitiesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [tab, setTab] = useState<Tab>('mine');
  const [search, setSearch] = useState('');

  const mine = useMyCommunities(userId);
  const discover = useDiscoverCommunities(tab === 'discover' ? search : '');

  const active = tab === 'mine' ? mine : discover;
  const rows = active.data ?? [];

  return (
    <div className="h-full overflow-y-auto bg-background pb-10">
      <PageTopBar
        title={t('communities.title')}
        backFallback="/perfil/menu"
        actions={
          <Link
            to="/comunidades/nova"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 font-sans text-label text-on-primary transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus size={16} aria-hidden />
            {t('communities.create')}
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-4">
        <div role="tablist" aria-label={t('communities.title')} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container-low p-1">
          <TabButton id="mine-tab" active={tab === 'mine'} label={t('communities.tab.mine')} onClick={() => setTab('mine')} />
          <TabButton
            id="discover-tab"
            active={tab === 'discover'}
            label={t('communities.tab.discover')}
            onClick={() => setTab('discover')}
          />
        </div>

        {tab === 'discover' && (
          <div className="relative mt-4">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('communities.searchPlaceholder')}
              aria-label={t('communities.searchPlaceholder')}
              className="min-h-11 w-full rounded-xl border border-outline-variant/50 bg-surface-container-low pl-10 pr-3.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        <section role="tabpanel" aria-labelledby={tab === 'mine' ? 'mine-tab' : 'discover-tab'} className="mt-4">
          {active.isLoading ? (
            <LoadingCard />
          ) : active.isError ? (
            <p role="alert" className="px-1 py-6 font-sans text-body text-error">
              {t('communities.loadError')}
            </p>
          ) : rows.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="divide-y divide-outline-variant/30 overflow-hidden rounded-2xl bg-surface-container">
              {rows.map((community) => (
                <CommunityRow key={community.id} community={community} ownerId={userId} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TabButton({ id, active, label, onClick }: { id: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center rounded-lg px-3 font-sans text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'bg-surface-container-high text-on-surface'
          : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface',
      )}
    >
      {label}
    </button>
  );
}

function CommunityRow({ community, ownerId }: { community: Community; ownerId: string | undefined }) {
  const { t } = useTranslation();
  const isOwner = Boolean(ownerId && community.creator_id === ownerId);
  const memberCount = community.member_count ?? 0;
  const isPrivate = community.visibility === 'private';

  return (
    <Link
      to={`/comunidades/${community.id}`}
      className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-surface-container-high"
    >
      <CommunityAvatar name={community.name} imageUrl={community.image_url} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate font-sans text-title text-on-surface">{community.name}</h3>
          {isPrivate ? (
            <Lock size={14} className="shrink-0 text-on-surface-variant" aria-label={t('communities.private')} />
          ) : (
            <Globe2 size={14} className="shrink-0 text-on-surface-variant" aria-label={t('communities.public')} />
          )}
        </div>
        <p className="mt-0.5 truncate font-sans text-body-sm text-on-surface-variant">
          {[
            t(memberCount === 1 ? 'communities.memberCountOne' : 'communities.memberCount').replace(
              '{count}',
              String(memberCount),
            ),
            isOwner ? t('communities.ownerBadge') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
    </Link>
  );
}

export function CommunityAvatar({ name, imageUrl, size = 'md' }: { name: string | null; imageUrl: string | null; size?: 'md' | 'lg' }) {
  const className = size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-11 w-11 rounded-xl';
  return imageUrl ? (
    <img src={imageUrl} alt="" className={clsx(className, 'shrink-0 object-cover')} />
  ) : (
    <span
      className={clsx(className, 'flex shrink-0 items-center justify-center bg-surface-container-high text-on-surface-variant')}
      aria-label={name ?? undefined}
    >
      <UsersRound size={size === 'lg' ? 26 : 20} aria-hidden />
    </span>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-container px-4 py-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant">
        <UsersRound size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="font-sans text-body font-semibold text-on-surface">
          {tab === 'mine' ? t('communities.emptyMineTitle') : t('communities.emptyDiscoverTitle')}
        </h3>
        <p className="mt-1 max-w-[46ch] font-sans text-body-sm text-on-surface-variant">
          {tab === 'mine' ? t('communities.emptyMineDescription') : t('communities.emptyDiscoverDescription')}
        </p>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-container px-4 py-4">
      <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-surface-container-high" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-2/5 animate-pulse rounded bg-surface-container-highest" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container-high" />
      </div>
    </div>
  );
}
