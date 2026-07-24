import { FormEvent, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ExternalLink, History, Loader2, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { supabase } from '@/lib/supabase';

type AiRole = 'user' | 'assistant';

type AiReference = {
  id: string;
  source_name: string;
  title: string;
  source_url: string;
  domain: string;
};

type AiMessage = {
  id: string;
  role: AiRole;
  content: string;
  references?: AiReference[];
  createdAt?: string;
};

type Conversation = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type HistoryMessageRow = {
  id: string;
  role: AiRole;
  content: string;
  context_sections: string[];
  source_references: AiReference[];
  safety_flags: Record<string, unknown>;
  created_at: string;
};

type MyFitAiHistoryResponse = {
  conversations?: Conversation[];
  selected_conversation_id?: string | null;
  messages?: HistoryMessageRow[];
  error?: string;
};

type MyFitAiChatResponse = {
  answer?: string;
  error?: string;
  conversation_id?: string;
  message_id?: string;
  references?: AiReference[];
  context_summary?: {
    sections?: string[];
  };
};

const starterPrompts = [
  'Como ajustar meu treino hoje?',
  'O que minha ficha de saúde pede atenção?',
  'Sugira trocas para minha dieta',
  'Monte uma semana equilibrada',
];

const initialMessage: AiMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Sou a IA OnlyFit. Posso cruzar seus treinos, dieta, ficha de saúde, compras e histórico para dar sugestões seguras. Não substituo seu médico ou profissional.',
};

function historyKey(conversationId: string | null) {
  return ['myfit-ai-history', conversationId ?? 'latest'] as const;
}

function createMessage(role: AiRole, content: string, references?: AiReference[]): AiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    references,
    createdAt: new Date().toISOString(),
  };
}

function readableError(error?: string): string {
  if (error === 'message_too_long') return 'Sua mensagem ficou longa demais. Envie em partes menores.';
  if (error === 'unauthorized') return 'Entre novamente na sua conta para falar com a IA.';
  if (error === 'assistant_unavailable') return 'A IA ficou indisponível por alguns instantes. Tente de novo.';
  if (error === 'history_unavailable') return 'Não consegui carregar seu histórico agora.';
  if (error === 'conversation_not_found') return 'Essa conversa não está mais disponível.';
  if (error?.toLowerCase().includes('muitas requisicoes')) return 'Muitas mensagens em sequência. Aguarde alguns segundos.';
  return 'Não consegui responder agora. Tente novamente.';
}

function mapHistoryMessage(row: HistoryMessageRow): AiMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    references: row.source_references ?? [],
    createdAt: row.created_at,
  };
}

async function loadHistory(conversationId: string | null): Promise<MyFitAiHistoryResponse> {
  const { data, error } = await supabase.functions.invoke<MyFitAiHistoryResponse>('myfit-assistant-history', {
    body: { action: 'load', ...(conversationId ? { conversation_id: conversationId } : {}) },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data ?? { conversations: [], selected_conversation_id: null, messages: [] };
}

export function MyFitAiPage() {
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [newConversation, setNewConversation] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<AiMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const historyQuery = useQuery({
    queryKey: historyKey(selectedConversationId),
    enabled: !newConversation,
    staleTime: 15_000,
    queryFn: () => loadHistory(selectedConversationId),
  });

  const historyData = historyQuery.data;
  const activeConversationId = newConversation
    ? null
    : selectedConversationId ?? historyData?.selected_conversation_id ?? null;
  const conversations = historyData?.conversations ?? [];
  const persistedMessages = historyData?.messages?.map(mapHistoryMessage) ?? [];
  const messages = [
    ...(newConversation || persistedMessages.length === 0 ? [initialMessage] : persistedMessages),
    ...(pendingMessage ? [pendingMessage] : []),
  ];

  const coveredSections = useMemo(() => {
    const sections = (historyData?.messages ?? []).flatMap((message) => message.context_sections ?? []);
    return [...new Set(sections)].slice(0, 6);
  }, [historyData?.messages]);

  async function sendMessage(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || isSending) return;

    const conversationId = activeConversationId;
    const userMessage = createMessage('user', text);
    setPendingMessage(userMessage);
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<MyFitAiChatResponse>('myfit-assistant-chat', {
        body: { message: text, ...(conversationId ? { conversation_id: conversationId } : {}) },
      });

      if (invokeError) {
        let code = invokeError.message;
        try {
          const context = (invokeError as { context?: Response }).context;
          if (context && typeof context.json === 'function') {
            const body = await context.json();
            if (typeof body?.error === 'string') code = body.error;
          }
        } catch {
          code = invokeError.message;
        }
        throw new Error(code);
      }
      if (data?.error) throw new Error(data.error);

      const nextConversationId = data?.conversation_id ?? conversationId;
      const answer = data?.answer?.trim() || 'Não encontrei contexto suficiente para responder com segurança.';
      const assistantMessage = createMessage('assistant', answer, data?.references ?? []);
      const contextSections = data?.context_summary?.sections ?? [];

      if (nextConversationId) {
        const timestamp = new Date().toISOString();
        const optimisticConversation: Conversation = {
          id: nextConversationId,
          title: text.slice(0, 64),
          status: 'active',
          created_at: timestamp,
          updated_at: timestamp,
          last_message_at: timestamp,
        };
        const optimisticMessages: HistoryMessageRow[] = [
          ...(newConversation ? [] : historyData?.messages ?? []),
          {
            id: userMessage.id,
            role: 'user',
            content: userMessage.content,
            context_sections: contextSections,
            source_references: [],
            safety_flags: {},
            created_at: userMessage.createdAt ?? timestamp,
          },
          {
            id: data?.message_id ?? assistantMessage.id,
            role: 'assistant',
            content: assistantMessage.content,
            context_sections: contextSections,
            source_references: assistantMessage.references ?? [],
            safety_flags: { medical_disclaimer: true, mutable_tools: false },
            created_at: assistantMessage.createdAt ?? timestamp,
          },
        ];
        const updateHistoryCache = (current?: MyFitAiHistoryResponse): MyFitAiHistoryResponse => {
          const baseConversations = current?.conversations ?? conversations;
          const nextConversations = baseConversations.some((conversation) => conversation.id === nextConversationId)
            ? baseConversations.map((conversation) =>
                conversation.id === nextConversationId
                  ? { ...conversation, updated_at: timestamp, last_message_at: timestamp }
                  : conversation,
              )
            : [optimisticConversation, ...baseConversations];
          return {
            conversations: nextConversations,
            selected_conversation_id: nextConversationId,
            messages: optimisticMessages,
          };
        };

        const cacheKey = historyKey(nextConversationId);
        queryClient.setQueryData<MyFitAiHistoryResponse>(cacheKey, updateHistoryCache);
        queryClient.setQueryData<MyFitAiHistoryResponse>(historyKey(null), updateHistoryCache);
        setSelectedConversationId(nextConversationId);
        setNewConversation(false);
      }

      setPendingMessage(null);
    } catch (err) {
      const message = err instanceof Error ? readableError(err.message) : readableError();
      setError(message);
      setPendingMessage(createMessage('assistant', message));
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function archiveConversation() {
    if (!activeConversationId || isSending) return;
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
        'myfit-assistant-history',
        { body: { action: 'archive', conversation_id: activeConversationId } },
      );
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setSelectedConversationId(null);
      setNewConversation(false);
      setPendingMessage(null);
      await queryClient.invalidateQueries({ queryKey: ['myfit-ai-history'] });
    } catch (err) {
      setError(err instanceof Error ? readableError(err.message) : readableError());
    }
  }

  function startNewConversation() {
    setNewConversation(true);
    setSelectedConversationId(null);
    setPendingMessage(null);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <PageTopBar
        title="IA OnlyFit"
        description="Seu assistente de bolso"
        backFallback="/meu-fit"
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startNewConversation}
              aria-label="Nova conversa"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface active:bg-surface-container-high"
            >
              <Plus size={19} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void archiveConversation()}
              disabled={!activeConversationId || isSending}
              aria-label="Arquivar conversa"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface active:bg-surface-container-high disabled:opacity-40"
            >
              <Archive size={18} aria-hidden />
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <section className="rounded-2xl border border-outline-variant/35 bg-surface-container-low p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-sans text-label text-on-surface">Contexto privado e seguro</p>
              <p className="mt-0.5 font-sans text-body-sm text-on-surface-variant">
                A IA lê seus dados no servidor, salva a conversa e não altera nada sozinha.
              </p>
            </div>
          </div>
          {coveredSections.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {coveredSections.map((section) => (
                <span key={section} className="rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">
                  {section}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={startNewConversation}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 font-sans text-body-sm ${
              newConversation
                ? 'bg-primary text-on-primary'
                : 'border border-outline-variant/40 bg-surface-container text-on-surface'
            }`}
          >
            <Sparkles size={15} aria-hidden />
            Nova
          </button>
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => {
                setSelectedConversationId(conversation.id);
                setNewConversation(false);
                setPendingMessage(null);
                setError(null);
              }}
              className={`inline-flex min-h-10 max-w-48 shrink-0 items-center gap-2 rounded-full px-4 font-sans text-body-sm ${
                !newConversation && activeConversationId === conversation.id
                  ? 'bg-primary-container text-on-primary-container'
                  : 'border border-outline-variant/40 bg-surface-container text-on-surface'
              }`}
            >
              <History size={15} aria-hidden />
              <span className="truncate">{conversation.title}</span>
            </button>
          ))}
        </div>

        {historyQuery.isLoading && !newConversation ? (
          <div className="mt-8 flex justify-center text-on-surface-variant">
            <Loader2 size={24} className="animate-spin" aria-label="Carregando histórico" />
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void sendMessage(prompt)}
              disabled={isSending}
              className="min-h-10 rounded-full border border-outline-variant/40 bg-surface-container px-4 font-sans text-body-sm text-on-surface active:bg-surface-container-high disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3 pb-4">
          {messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <article key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[86%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-primary text-on-primary'
                      : 'border border-outline-variant/35 bg-surface-container text-on-surface'
                  }`}
                >
                  <p className="whitespace-pre-wrap font-sans text-body leading-relaxed">{message.content}</p>
                  {!isUser && message.references?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-outline-variant/25 pt-3">
                      {message.references.slice(0, 3).map((reference) => (
                        <a
                          key={reference.id}
                          href={reference.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-container-high px-3 font-sans text-counter text-primary"
                        >
                          {reference.source_name}
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {isSending ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-outline-variant/35 bg-surface-container px-4 py-3 text-on-surface-variant">
                <Loader2 size={18} className="animate-spin" aria-hidden />
                <span className="font-sans text-body-sm">Analisando seu contexto...</span>
              </div>
            </div>
          ) : null}
          {error ? <p className="px-1 font-sans text-body-sm text-error">{error}</p> : null}
        </div>
      </main>

      <form
        onSubmit={handleSubmit}
        className="border-t border-outline-variant/30 bg-surface-container-lowest/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-outline-variant/40 bg-surface-container px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Pergunte sobre treino, dieta, saúde ou rotina..."
            rows={1}
            maxLength={1800}
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2 font-sans text-body text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            aria-label="Enviar mensagem"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary active:scale-[0.96] disabled:bg-surface-container-high disabled:text-on-surface-variant"
          >
            {isSending ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Send size={20} aria-hidden />}
          </button>
        </div>
      </form>
    </div>
  );
}
