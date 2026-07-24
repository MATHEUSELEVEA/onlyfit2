import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight, Heart, Loader2, MessageCircle, Radio, UsersRound } from 'lucide-react';
import { clsx } from 'clsx';
import { BackButton } from '@/components/ui/BackButton';
import {
  useMarkNotificationsRead,
  useNotifications,
  useRealtimeNotifications,
  type ActivityNotification,
} from './useNotifications';

function iconFor(type: string) {
  if (type === 'post_like') return Heart;
  if (type === 'community_comment') return UsersRound;
  if (type === 'post_comment' || type === 'post_reply') return MessageCircle;
  return Radio;
}

function formatTime(value: string) {
  const date = new Date(value);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { data = [], isLoading, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationsRead();
  useRealtimeNotifications();

  const unread = data.filter((item) => !item.readAt);

  function openNotification(item: ActivityNotification) {
    if (!item.readAt) markRead.mutate([item.id]);
    if (item.path) navigate(item.path);
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-8">
      <div className="mx-auto min-h-full w-full max-w-[720px] bg-background">
        <header className="sticky top-0 z-20 border-b border-outline-variant/35 bg-background/95 px-4 pb-4 pt-safe-top backdrop-blur-md">
          <div className="flex min-h-14 items-center justify-between gap-3">
            <BackButton fallback="/perfil" />
            <div className="min-w-0 flex-1">
              <p className="font-sans text-title-lg text-on-surface">Atualizações</p>
              <p className="font-sans text-body-sm text-on-surface-variant">
                {unread.length ? `${unread.length} novas` : 'Tudo em dia'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={!unread.length || markRead.isPending}
              className="flex min-h-11 items-center gap-2 rounded-full px-3 font-sans text-label text-primary disabled:text-on-surface-variant/60"
            >
              {markRead.isPending ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <CheckCheck size={17} aria-hidden />}
              Ler tudo
            </button>
          </div>
        </header>

        {isLoading && (
          <div className="flex h-56 items-center justify-center">
            <Loader2 size={28} className="animate-spin text-on-surface-variant" aria-label="Carregando" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="font-sans text-body text-on-surface-variant">Não foi possível carregar as atualizações.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="min-h-11 rounded-full bg-primary px-6 font-sans text-label text-on-primary"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {!isLoading && !isError && data.length === 0 && (
          <div className="flex flex-col items-center px-6 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bell size={24} aria-hidden />
            </div>
            <p className="mt-4 font-sans text-title text-on-surface">Sem atualizações</p>
            <p className="mt-1 max-w-xs font-sans text-body-sm text-on-surface-variant">
              Curtidas, comentários, respostas e comunidades aparecem aqui.
            </p>
          </div>
        )}

        {!isLoading && !isError && data.length > 0 && (
          <ul className="divide-y divide-outline-variant/25">
            {data.map((item) => {
              const Icon = iconFor(item.type);
              const content = (
                <>
                  <span className={clsx('mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full', item.readAt ? 'bg-surface-container text-on-surface-variant' : 'bg-primary/10 text-primary')}>
                    {item.actor?.avatarUrl ? (
                      <img src={item.actor.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <Icon size={19} aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-body font-semibold text-on-surface">{item.title}</span>
                    {item.description && (
                      <span className="mt-1 line-clamp-2 block font-sans text-body-sm text-on-surface-variant">
                        {item.description}
                      </span>
                    )}
                    <span className="mt-1 block font-sans text-counter text-on-surface-variant">{formatTime(item.createdAt)}</span>
                  </span>
                  {!item.readAt && <span className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
                  {item.path && <ChevronRight size={18} className="mt-3 shrink-0 text-on-surface-variant" aria-hidden />}
                </>
              );

              return (
                <li key={item.id}>
                  {item.path ? (
                    <button
                      type="button"
                      onClick={() => openNotification(item)}
                      className="flex min-h-20 w-full items-start gap-3 px-4 py-3 text-left active:bg-surface-container"
                    >
                      {content}
                    </button>
                  ) : (
                    <Link to="/perfil/atualizacoes" className="flex min-h-20 items-start gap-3 px-4 py-3">
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
