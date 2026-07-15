import { useState } from 'react';
import { Check, Instagram, Link2, type LucideIcon } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  /** Texto que acompanha o link no WhatsApp. */
  text?: string;
  onShared?: () => void;
}

// lucide não tem mais ícones de marca do WhatsApp; path oficial inline.
function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

interface ShareOptionProps {
  icon: LucideIcon | typeof WhatsAppIcon;
  title: string;
  description: string;
  onClick: () => void;
  highlighted?: boolean;
}

function ShareOption({ icon: Icon, title, description, onClick, highlighted }: ShareOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] w-full items-center gap-4 border-b border-outline-variant/20 px-3 py-3 text-left last:border-b-0 active:bg-surface-container"
    >
      <span
        className={
          highlighted
            ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary'
            : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'
        }
      >
        <Icon size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-sans text-body font-semibold text-on-surface">{title}</span>
        <span className="mt-0.5 block font-sans text-body-sm text-on-surface-variant">
          {description}
        </span>
      </span>
    </button>
  );
}

export function ShareSheet({ open, onClose, url, text, onShared }: ShareSheetProps) {
  const [copied, setCopied] = useState<'link' | 'instagram' | 'error' | null>(null);

  // Limpa o feedback ao fechar para a próxima abertura começar zerada.
  function handleClose() {
    setCopied(null);
    onClose();
  }

  async function handleCopyLink() {
    const ok = await copyToClipboard(url);
    setCopied(ok ? 'link' : 'error');
    if (ok) onShared?.();
  }

  function handleWhatsApp() {
    const message = text ? `${text} ${url}` : url;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    onShared?.();
    handleClose();
  }

  async function handleInstagram() {
    // O Instagram não aceita link externo por URL; copiamos o link e
    // abrimos o app/site para a pessoa colar no story ou direct.
    const ok = await copyToClipboard(url);
    setCopied(ok ? 'instagram' : 'error');
    if (ok) onShared?.();
    window.open('https://www.instagram.com/', '_blank', 'noopener');
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Compartilhar" description="Escolha como enviar este link.">
      <div className="px-5 pb-6 pt-1">
        <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/40">
          <ShareOption
            icon={copied === 'link' ? Check : Link2}
            title={copied === 'link' ? 'Link copiado' : 'Copiar link'}
            description="Copiar para a área de transferência"
            onClick={handleCopyLink}
            highlighted={copied === 'link'}
          />
          <ShareOption
            icon={WhatsAppIcon}
            title="WhatsApp"
            description="Enviar para um contato ou grupo"
            onClick={handleWhatsApp}
          />
          <ShareOption
            icon={copied === 'instagram' ? Check : Instagram}
            title="Instagram"
            description={
              copied === 'instagram'
                ? 'Link copiado — cole no story ou direct'
                : 'Copia o link e abre o Instagram'
            }
            onClick={handleInstagram}
            highlighted={copied === 'instagram'}
          />
        </div>
        {copied === 'error' && (
          <p className="mt-3 px-1 font-sans text-body-sm text-error">
            Não foi possível copiar o link. Copie manualmente: {url}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
