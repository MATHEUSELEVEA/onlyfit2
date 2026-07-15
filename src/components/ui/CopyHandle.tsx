import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from '@/i18n/I18nProvider';

interface CopyHandleProps {
  username: string;
  className?: string;
}

/**
 * O @usuário de um perfil, clicável para copiar. Existe porque convidar,
 * mencionar ou indicar alguém exige o @ exato — e ninguém decora o dos outros.
 */
export function CopyHandle({ username, className }: CopyHandleProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setState('copied');
    } catch {
      setState('error');
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <span className={clsx('inline-flex flex-col items-center', className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={t('copyHandle.action')}
        className={clsx(
          'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-sans text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          state === 'copied'
            ? 'text-primary'
            : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface active:bg-surface-container-high',
        )}
      >
        @{username}
        {state === 'copied' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </button>
      {/* O check no próprio botão já confirma para quem vê; isto narra a quem
          não vê, sem reservar um vão permanente sob o nome. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? t('copyHandle.copied') : ''}
      </span>
      {state === 'error' && (
        <span role="alert" className="font-sans text-body-sm text-error">
          {t('copyHandle.error')}
        </span>
      )}
    </span>
  );
}
