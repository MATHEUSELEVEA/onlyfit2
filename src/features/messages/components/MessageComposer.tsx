import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Mic, Send, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from '@/i18n/I18nProvider';
import { mediaTypeFromMime, readImageSize, uploadMessageMedia } from '../media';
import { useVoiceRecorder } from '../useVoiceRecorder';
import { formatDuration } from '../time';
import type { MediaType, SendPayload } from '../types';

interface Attachment {
  file: File;
  previewUrl: string;
  kind: MediaType;
}

const CANCEL_THRESHOLD = 60;

export function MessageComposer({ onSend }: { onSend: (payload: SendPayload) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [willCancel, setWillCancel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pressStartX = useRef(0);
  const cancelRef = useRef(false);
  const recorder = useVoiceRecorder();

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const kind = mediaTypeFromMime(file.type);
    if (kind !== 'image' && kind !== 'video') return;
    setError(null);
    setAttachment({ file, previewUrl: URL.createObjectURL(file), kind });
  }

  function clearAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  }

  async function handleSend() {
    if (uploading) return;
    const trimmed = text.trim();

    // Texto puro (com ou sem link) — sem anexo.
    if (!attachment && trimmed) {
      onSend({ body: trimmed });
      setText('');
      return;
    }
    if (!attachment) return;

    // Anexo de imagem/vídeo (texto vira legenda).
    setUploading(true);
    setError(null);
    try {
      const url = await uploadMessageMedia(attachment.file, attachment.file.type);
      const size = attachment.kind === 'image' ? await readImageSize(attachment.file) : null;
      onSend({
        body: trimmed || null,
        media_url: url,
        media_type: attachment.kind,
        media_meta: {
          mime: attachment.file.type,
          size: attachment.file.size,
          name: attachment.file.name,
          ...(size ? { width: size.width, height: size.height } : {}),
        },
      });
      setText('');
      clearAttachment();
    } catch {
      setError(t('messages.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function finishRecording() {
    const result = await recorder.stop(cancelRef.current);
    setWillCancel(false);
    if (!result) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadMessageMedia(result.blob, result.mime);
      onSend({
        media_url: url,
        media_type: 'audio',
        media_meta: { mime: result.mime, size: result.blob.size, duration_ms: result.durationMs },
      });
    } catch {
      setError(t('messages.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function onMicDown(event: React.PointerEvent) {
    if (uploading) return;
    cancelRef.current = false;
    pressStartX.current = event.clientX;
    setWillCancel(false);
    void recorder.start();
  }

  function onMicMove(event: React.PointerEvent) {
    if (!recorder.isRecording) return;
    const cancelling = event.clientX - pressStartX.current < -CANCEL_THRESHOLD;
    cancelRef.current = cancelling;
    setWillCancel(cancelling);
  }

  function onMicUp() {
    if (!recorder.isRecording) return;
    void finishRecording();
  }

  const canSend = Boolean(text.trim() || attachment) && !uploading;
  const showMic = !text.trim() && !attachment;
  const micError = recorder.error ? t('messages.micDenied') : null;

  return (
    <div className="border-t border-outline-variant/40 bg-surface px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      {(error || micError) && (
        <p className="px-1 pb-1 font-sans text-body-sm text-error">{error ?? micError}</p>
      )}

      {/* Preview do anexo antes de enviar */}
      {attachment && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl bg-surface-container p-2">
          {attachment.kind === 'image' ? (
            <img src={attachment.previewUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <video src={attachment.previewUrl} className="h-14 w-14 rounded-xl bg-black object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate font-sans text-body-sm text-on-surface-variant">
            {attachment.file.name}
          </span>
          <button
            type="button"
            onClick={clearAttachment}
            aria-label={t('messages.removeAttachment')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container-high"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      )}

      {recorder.isRecording ? (
        /* Barra de gravação: solte o microfone para enviar, deslize p/ cancelar */
        <div className="flex items-center gap-3 py-1">
          <span
            className={clsx(
              'flex h-3 w-3 shrink-0 animate-pulse rounded-full',
              willCancel ? 'bg-on-surface-variant' : 'bg-error',
            )}
          />
          <span className="font-sans text-body tabular-nums text-on-surface">
            {formatDuration(recorder.elapsedMs)}
          </span>
          <span className="flex-1 truncate font-sans text-body-sm text-on-surface-variant">
            {willCancel ? t('messages.cancel') : t('messages.releaseToSend')}
          </span>
          <Trash2
            size={20}
            aria-hidden
            className={clsx('shrink-0', willCancel ? 'text-error' : 'text-on-surface-variant')}
          />
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={pickFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label={t('messages.attach')}
            disabled={uploading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors active:bg-surface-container disabled:opacity-40"
          >
            <ImagePlus size={22} aria-hidden />
          </button>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (canSend) void handleSend();
              }
            }}
            rows={1}
            placeholder={t('messages.placeholder')}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-outline-variant/50 bg-surface-container px-4 py-2.5 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />

          {showMic ? (
            <button
              type="button"
              onPointerDown={onMicDown}
              onPointerMove={onMicMove}
              onPointerUp={onMicUp}
              onPointerCancel={() => void recorder.stop(true)}
              aria-label={t('messages.recordVoice')}
              className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-full bg-surface-container text-on-surface transition-transform active:scale-95"
            >
              <Mic size={20} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label={t('messages.send')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-transform active:scale-95 disabled:opacity-40"
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin" aria-hidden />
              ) : (
                <Send size={20} aria-hidden />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
