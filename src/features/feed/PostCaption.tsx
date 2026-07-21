import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';

interface PostCaptionProps {
  text: string;
}

// Legenda do criador no estilo TikTok, com acabamento premium:
// - colapsada mostra 2 linhas; se passar disso, corta com "mais";
// - ao tocar em "mais", expande com transição SUAVE (a coluna é ancorada no
//   rodapé, então tudo sobe junto — sem salto); texto longo rola com fade nas
//   bordas (máscara), em vez de corte seco;
// - fundo transparente (o texto vive sobre a mídia, só com sombra).
export function PostCaption({ text }: PostCaptionProps) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  const measure = useCallback(() => {
    const el = paragraphRef.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useLayoutEffect(() => {
    if (!expanded) measure();
  }, [text, expanded, measure]);

  useEffect(() => {
    if (expanded) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expanded, measure]);

  if (!text) return null;

  return (
    <div
      className={clsx(
        'relative transition-[max-height] duration-300 ease-out motion-reduce:transition-none',
        expanded
          ? 'no-scrollbar max-h-40 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,#000_14px,#000_calc(100%-14px),transparent)]'
          : 'max-h-[2.9em] overflow-hidden',
      )}
    >
      <p
        ref={paragraphRef}
        className={clsx('select-none whitespace-pre-wrap font-sans text-body-sm text-white drop-shadow', !expanded && 'line-clamp-2')}
      >
        {text}
        {expanded && (
          <>
            {' '}
            <button type="button" onClick={() => setExpanded(false)} className="font-sans text-label text-white/60">
              menos
            </button>
          </>
        )}
      </p>
      {!expanded && clamped && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          // Fade curto (mesma cor do gradiente do card) só para encaixar o "mais"
          // no fim da 2ª linha, sem virar um bloco.
          className="absolute bottom-0 right-0 pl-10 font-sans text-label text-white/90 drop-shadow [background:linear-gradient(to_right,transparent,rgba(0,0,0,0.45)_50%)]"
        >
          mais
        </button>
      )}
    </div>
  );
}
