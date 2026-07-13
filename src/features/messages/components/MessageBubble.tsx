import { Fragment, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import { clockTime } from '../time';
import { VoiceMessage } from './VoiceMessage';
import type { ChatMessage } from '../types';

const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const URL_TEST_RE = /^https?:\/\/[^\s]+$/;

// Transforma URLs no texto em links clicáveis (auto-link à la Instagram).
function linkify(text: string, linkClass: string): ReactNode {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, i) =>
    URL_TEST_RE.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx('underline underline-offset-2 break-all', linkClass)}
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function MessageBubble({ message, isMe }: { message: ChatMessage; isMe: boolean }) {
  const { t, language } = useTranslation();
  const hasText = Boolean(message.body && message.body.trim());
  const isMediaOnly = Boolean(message.media_url) && !hasText;

  const bubbleTone = isMe
    ? 'bg-primary text-on-primary rounded-br-md'
    : 'bg-surface-container-high text-on-surface rounded-bl-md';
  const linkTone = isMe ? 'text-on-primary' : 'text-primary';
  const metaTone = isMe ? 'text-on-primary/60' : 'text-on-surface-variant';

  return (
    <div className={clsx('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[78%] overflow-hidden rounded-3xl',
          message.pending && 'opacity-60',
          // Mídia ocupa a bolha inteira; texto ganha respiro interno.
          isMediaOnly ? 'p-1' : 'px-3.5 py-2.5',
          bubbleTone,
        )}
      >
        {message.media_type === 'image' && message.media_url && (
          <a href={message.media_url} target="_blank" rel="noopener noreferrer">
            <img
              src={message.media_url}
              alt={t('messages.imageAlt')}
              className="max-h-72 w-full rounded-[1.25rem] object-cover"
              loading="lazy"
            />
          </a>
        )}

        {message.media_type === 'video' && message.media_url && (
          <video
            src={message.media_url}
            poster={message.media_meta?.poster_url ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-80 w-full rounded-[1.25rem] bg-black"
          />
        )}

        {message.media_type === 'audio' && message.media_url && (
          <VoiceMessage
            url={message.media_url}
            durationMs={message.media_meta?.duration_ms}
            isMe={isMe}
          />
        )}

        {hasText && (
          <p
            className={clsx(
              'whitespace-pre-wrap break-words font-sans text-body',
              isMediaOnly ? 'px-2.5 pb-1 pt-2' : '',
            )}
          >
            {linkify(message.body!, linkTone)}
          </p>
        )}

        <span
          className={clsx(
            'mt-1 block text-right font-sans text-eyebrow tabular-nums',
            metaTone,
            isMediaOnly && 'px-2.5 pb-1',
          )}
        >
          {clockTime(message.created_at, language)}
        </span>
      </div>
    </div>
  );
}
