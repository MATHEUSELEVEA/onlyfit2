import { useRef, useState } from 'react';
import { Check, Loader2, Send, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAuth } from '@/contexts/AuthContext';
import {
  countComments,
  useAddPostComment,
  useDeletePostComment,
  useEditPostComment,
  usePostComments,
  type PostComment,
} from './usePostComments';

type ComposerMode =
  | { kind: 'compose' }
  | { kind: 'reply'; parent: PostComment }
  | { kind: 'edit'; comment: PostComment };

function relativeTime(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return `${Math.floor(days / 7)} sem`;
}

function displayName(comment: PostComment): string {
  return comment.author.fullName || comment.author.username || 'Anônimo';
}

function CommentAvatar({ comment, size = 'md' }: { comment: PostComment; size?: 'md' | 'sm' }) {
  const name = displayName(comment);
  const box = size === 'sm' ? 'h-6 w-6 text-counter' : 'h-8 w-8 text-counter';
  if (comment.author.avatarUrl) {
    return (
      <img
        src={comment.author.avatarUrl}
        alt={`Avatar de ${name}`}
        className={`${box} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-surface-container-high font-sans text-on-surface-variant`}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CommentRow({
  comment,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  nested = false,
}: {
  comment: PostComment;
  currentUserId: string | undefined;
  onReply: (comment: PostComment) => void;
  onEdit: (comment: PostComment) => void;
  onDelete: (comment: PostComment) => void;
  nested?: boolean;
}) {
  const name = displayName(comment);
  const isOwn = Boolean(currentUserId && comment.userId === currentUserId);
  const edited = Boolean(comment.updatedAt && comment.updatedAt !== comment.createdAt);

  return (
    <li className={nested ? 'flex gap-2.5' : 'flex gap-3'}>
      <CommentAvatar comment={comment} size={nested ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-sans text-body-sm font-semibold text-on-surface">{name}</span>
          {comment.author.username && (
            <span className="font-sans text-counter font-normal text-on-surface-variant">
              @{comment.author.username}
            </span>
          )}
          {comment.createdAt && (
            <span className="font-sans text-counter font-normal text-on-surface-variant">
              {relativeTime(comment.createdAt)}
            </span>
          )}
          {edited && (
            <span className="font-sans text-counter font-normal text-on-surface-variant">· editado</span>
          )}
        </p>
        <p className="mt-0.5 break-words font-sans text-body text-on-surface">{comment.body}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="min-h-[32px] font-sans text-counter font-semibold text-on-surface-variant transition-colors active:text-on-surface"
          >
            Responder
          </button>
          {isOwn && (
            <>
              <button
                type="button"
                onClick={() => onEdit(comment)}
                className="min-h-[32px] font-sans text-counter font-semibold text-on-surface-variant transition-colors active:text-on-surface"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onDelete(comment)}
                className="min-h-[32px] font-sans text-counter font-semibold text-error/80 transition-colors active:text-error"
              >
                Excluir
              </button>
            </>
          )}
        </div>

        {comment.replies.length > 0 && (
          <ul className="mt-3 space-y-3 border-l border-outline-variant/30 pl-3">
            {comment.replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                nested
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

interface CommentsSheetProps {
  postId: string | null;
  onClose: () => void;
}

export function CommentsSheet({ postId, onClose }: CommentsSheetProps) {
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>({ kind: 'compose' });
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = Boolean(postId);

  const { data: comments = [], isLoading, isError, refetch } = usePostComments(postId);
  const addComment = useAddPostComment(postId);
  const editComment = useEditPostComment(postId);
  const deleteComment = useDeletePostComment(postId);
  const totalCount = countComments(comments);
  const pending = addComment.isPending || editComment.isPending;

  function handleClose() {
    setText('');
    setMode({ kind: 'compose' });
    setSendError(null);
    onClose();
  }

  function focusComposer() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function startReply(comment: PostComment) {
    // Mantém a pessoa no banner; o parent_id da inserção sobe para a raiz (1 nível).
    setMode({ kind: 'reply', parent: comment });
    setText('');
    setSendError(null);
    focusComposer();
  }

  function startEdit(comment: PostComment) {
    setMode({ kind: 'edit', comment });
    setText(comment.body);
    setSendError(null);
    focusComposer();
  }

  function cancelComposerMode() {
    setMode({ kind: 'compose' });
    setText('');
    setSendError(null);
  }

  async function handleDelete(comment: PostComment) {
    const label = comment.replies.length > 0
      ? 'Excluir este comentário e as respostas?'
      : 'Excluir este comentário?';
    if (!window.confirm(label)) return;
    setSendError(null);
    try {
      await deleteComment.mutateAsync(comment.id);
      if (mode.kind === 'edit' && mode.comment.id === comment.id) cancelComposerMode();
      if (mode.kind === 'reply' && mode.parent.id === comment.id) cancelComposerMode();
    } catch (error) {
      setSendError(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível excluir. Tente novamente.',
      );
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setSendError(null);
    try {
      if (mode.kind === 'edit') {
        await editComment.mutateAsync({ commentId: mode.comment.id, body: trimmed });
        cancelComposerMode();
      } else {
        const replyTarget = mode.kind === 'reply' ? mode.parent : null;
        await addComment.mutateAsync({
          body: trimmed,
          parentId: replyTarget ? (replyTarget.parentId ?? replyTarget.id) : null,
        });
        setText('');
        setMode({ kind: 'compose' });
        inputRef.current?.focus();
      }
    } catch (error) {
      setSendError(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível enviar. Tente novamente.',
      );
    }
  }

  const placeholder =
    mode.kind === 'edit'
      ? 'Editar comentário...'
      : mode.kind === 'reply'
        ? `Responder a @${mode.parent.author.username || displayName(mode.parent)}...`
        : 'Escreva um comentário...';

  const submitLabel =
    mode.kind === 'edit' ? 'Salvar edição' : mode.kind === 'reply' ? 'Enviar resposta' : 'Enviar comentário';

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={totalCount > 0 ? `Comentários (${totalCount})` : 'Comentários'}
      panelClassName="h-[60%]"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin text-on-surface-variant" aria-label="Carregando comentários" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-sans text-body text-on-surface-variant">
                Não foi possível carregar os comentários.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="min-h-[40px] rounded-full border border-outline-variant/60 px-5 font-sans text-label text-on-surface"
              >
                Tentar novamente
              </button>
            </div>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center font-sans text-body text-on-surface-variant">
              Seja a primeira pessoa a comentar.
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onReply={startReply}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-outline-variant/30 bg-background px-5 pb-4 pt-3"
        >
          {mode.kind !== 'compose' && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-sans text-body-sm text-on-surface-variant">
                {mode.kind === 'reply' ? (
                  <>
                    Respondendo a{' '}
                    <span className="font-semibold text-on-surface">
                      @{mode.parent.author.username || displayName(mode.parent)}
                    </span>
                  </>
                ) : (
                  <>Editando comentário</>
                )}
              </p>
              <button
                type="button"
                onClick={cancelComposerMode}
                aria-label="Cancelar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors active:bg-surface-container-high active:text-on-surface"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          )}
          {sendError && <p className="mb-2 font-sans text-body-sm text-error">{sendError}</p>}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={placeholder}
              maxLength={500}
              disabled={pending}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-outline-variant/40 bg-surface px-4 font-sans text-body text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              aria-label={submitLabel}
              disabled={!text.trim() || pending || (mode.kind === 'edit' && text.trim() === mode.comment.body)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-opacity disabled:opacity-40"
            >
              {pending ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : mode.kind === 'edit' ? (
                <Check size={18} aria-hidden />
              ) : (
                <Send size={18} aria-hidden />
              )}
            </button>
          </div>
        </form>
      </div>
    </BottomSheet>
  );
}
