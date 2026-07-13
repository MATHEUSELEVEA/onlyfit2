import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';
import { MessageBubble } from './components/MessageBubble';
import { MessageComposer } from './components/MessageComposer';
import { useChatMessages, useMarkThreadRead, usePeerProfile, useSendMessage } from './useChatThread';
import { useRealtimeMessages } from './useRealtimeMessages';
import { timeAgo } from './time';

function BubbleSkeleton({ isMe }: { isMe: boolean }) {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`h-10 animate-pulse rounded-3xl bg-surface-container ${isMe ? 'w-40' : 'w-52'}`}
      />
    </div>
  );
}

export function ChatPage() {
  const { peerId } = useParams<{ peerId: string }>();
  const navigate = useNavigate();
  const { t, language } = useTranslation();

  const { data: peer } = usePeerProfile(peerId);
  const { data: messages = [], isLoading, isError, refetch } = useChatMessages(peerId);
  const send = useSendMessage(peerId);
  useMarkThreadRead(peerId, messages);
  useRealtimeMessages(peerId);

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const name = peer?.name?.trim() || t('messages.title');
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-outline-variant/40 bg-surface px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => navigate('/mensagens')}
          aria-label={t('messages.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface active:bg-surface-container"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
          {peer?.avatarUrl ? (
            <img src={peer.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="font-sans text-label text-on-surface-variant">{initial}</span>
          )}
        </div>
        <h1 className="min-w-0 flex-1 truncate font-sans text-title text-on-surface">{name}</h1>
      </header>

      {/* Mensagens */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="font-sans text-body text-error">{t('messages.loadError')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="min-h-11 rounded-full bg-primary px-5 font-sans text-label text-on-primary active:scale-[0.98]"
            >
              {t('messages.retry')}
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 py-2">
            <BubbleSkeleton isMe={false} />
            <BubbleSkeleton isMe />
            <BubbleSkeleton isMe={false} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-sans text-title-lg text-on-surface">{t('messages.thread.empty')}</p>
            <p className="mt-1 font-sans text-body text-on-surface-variant">
              {t('messages.thread.emptyHint')}
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const showTime =
              !prev ||
              new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() > 300000;
            const isMe = message.sender_id !== peerId;
            return (
              <div key={message.id} className="space-y-1.5">
                {showTime && (
                  <p className="py-1 text-center font-sans text-eyebrow uppercase tracking-wide text-on-surface-variant">
                    {timeAgo(message.created_at, language)}
                  </p>
                )}
                <MessageBubble message={message} isMe={isMe} />
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <MessageComposer onSend={(payload) => send.mutate(payload)} />
    </div>
  );
}
