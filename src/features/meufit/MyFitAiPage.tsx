import { FormEvent, useRef, useState } from 'react';
import { ExternalLink, Loader2, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { supabase } from '@/lib/supabase';

type AiRole = 'user' | 'assistant';

type AiMessage = {
  id: string;
  role: AiRole;
  content: string;
  references?: AiReference[];
};

type AiReference = {
  id: string;
  source_name: string;
  title: string;
  source_url: string;
  domain: string;
};

type MyFitAiResponse = {
  answer?: string;
  error?: string;
  conversation_id?: string;
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

function createMessage(role: AiRole, content: string): AiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  };
}

function readableError(error?: string): string {
  if (error === 'message_too_long') return 'Sua mensagem ficou longa demais. Envie em partes menores.';
  if (error === 'unauthorized') return 'Entre novamente na sua conta para falar com a IA.';
  if (error === 'assistant_unavailable') return 'A IA ficou indisponível por alguns instantes. Tente de novo.';
  if (error === 'conversation_not_found') return 'Essa conversa expirou. Comecei uma nova conversa para você.';
  return 'Não consegui responder agora. Tente novamente.';
}

export function MyFitAiPage() {
  const [messages, setMessages] = useState<AiMessage[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [coveredSections, setCoveredSections] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function sendMessage(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || isSending) return;

    const userMessage = createMessage('user', text);
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError(null);
    setIsSending(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<MyFitAiResponse>('myfit-assistant-chat', {
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
      if (data?.conversation_id) setConversationId(data.conversation_id);
      if (data?.context_summary?.sections) setCoveredSections(data.context_summary.sections);

      const answer = data?.answer?.trim();
      setMessages((current) => [
        ...current,
        {
          ...createMessage('assistant', answer || 'Não encontrei contexto suficiente para responder com segurança.'),
          references: data?.references ?? [],
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? readableError(err.message) : readableError();
      setError(message);
      setMessages((current) => [...current, createMessage('assistant', message)]);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
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
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-primary">
            <Sparkles size={20} aria-hidden />
          </span>
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
                A IA lê seus dados no servidor e responde sem alterar nada sozinha.
              </p>
            </div>
          </div>
          {coveredSections.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {coveredSections.slice(0, 5).map((section) => (
                <span key={section} className="rounded-full bg-surface-container-high px-2.5 py-1 font-sans text-counter text-on-surface-variant">
                  {section}
                </span>
              ))}
            </div>
          ) : null}
        </section>

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
