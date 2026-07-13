import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import type { TranslationKey } from '@/i18n/translations';
import { useConversations } from './useConversations';
import { useRealtimeMessages } from './useRealtimeMessages';
import { timeAgo } from './time';
import type { Conversation } from './types';

function ConversationSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-container" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-surface-container" />
        <div className="h-2.5 w-44 animate-pulse rounded bg-surface-container/70" />
      </div>
    </div>
  );
}

const MEDIA_LABEL: Record<'image' | 'video' | 'audio', TranslationKey> = {
  image: 'messages.media.image',
  video: 'messages.media.video',
  audio: 'messages.media.audio',
};

export function InboxPage() {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { conversations, isLoading, isError, refetch } = useConversations();
  useRealtimeMessages();

  function preview(chat: Conversation): string {
    if (chat.lastMessage && chat.lastMessage.trim()) return chat.lastMessage;
    if (chat.lastMediaType) return t(MEDIA_LABEL[chat.lastMediaType]);
    return '';
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => navigate('/perfil')}
          aria-label={t('messages.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface active:bg-surface-container"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h1 className="font-sans text-title-lg text-on-surface">{t('messages.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <p className="font-sans text-body text-error">{t('messages.listError')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="min-h-11 rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              {t('messages.retry')}
            </button>
          </div>
        ) : isLoading ? (
          <div className="py-2">
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <MessageSquare size={28} aria-hidden />
            </span>
            <h2 className="mt-4 font-sans text-title text-on-surface">{t('messages.empty.title')}</h2>
            <p className="mt-1 font-sans text-body text-on-surface-variant">
              {t('messages.empty.subtitle')}
            </p>
            <Link
              to="/explorar"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              {t('messages.empty.explore')}
            </Link>
          </div>
        ) : (
          <ul>
            {conversations.map((chat) => (
              <li key={chat.peer.id}>
                <Link
                  to={`/mensagens/${chat.peer.id}`}
                  aria-label={t('messages.openConversation')}
                  className="flex items-center gap-3 px-4 py-3 active:bg-surface-container-low"
                >
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                    {chat.peer.avatarUrl ? (
                      <img src={chat.peer.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-sans text-title text-on-surface-variant">
                        {(chat.peer.name || 'U').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className={clsx(
                          'min-w-0 truncate font-sans text-body',
                          chat.unread > 0 ? 'font-semibold text-on-surface' : 'text-on-surface',
                        )}
                      >
                        {chat.peer.name || t('messages.title')}
                      </h3>
                      <span className="shrink-0 font-sans text-eyebrow text-on-surface-variant">
                        {timeAgo(chat.timestamp, language)}
                      </span>
                    </div>
                    <p
                      className={clsx(
                        'mt-0.5 truncate font-sans text-body-sm',
                        chat.unread > 0
                          ? 'font-medium text-on-surface'
                          : 'text-on-surface-variant',
                      )}
                    >
                      {preview(chat)}
                    </p>
                  </div>
                  {chat.unread > 0 && (
                    <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-error px-1.5 py-0.5 font-sans text-eyebrow font-bold tabular-nums text-on-error">
                      {chat.unread > 99 ? '99+' : chat.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
