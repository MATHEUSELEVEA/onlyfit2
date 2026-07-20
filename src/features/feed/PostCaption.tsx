import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface PostCaptionProps {
  text: string;
}

// Legenda do criador no estilo TikTok:
// - colapsada mostra 2 linhas; se o texto passar disso, corta com "… mais";
// - ao tocar em "mais", expande o texto inteiro (com rolagem se for muito grande);
// - fundo sempre transparente (o texto vive sobre a mídia, só com sombra).
// A legenda vive numa coluna flex ancorada no rodapé: expandir cresce para
// cima e o trilho de ações, alinhado pelo fundo, acompanha sozinho.
export function PostCaption({ text }: PostCaptionProps) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const paragraphRef = useRef<HTMLParagraphElement>(null);

  const measure = useCallback(() => {
    const el = paragraphRef.current;
    if (!el) return;
    // Só faz sentido medir no estado colapsado (com line-clamp aplicado).
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

  if (expanded) {
    return (
      <div className="no-scrollbar max-h-40 overflow-y-auto">
        <p className="select-none whitespace-pre-wrap font-sans text-body-sm text-white drop-shadow">
          {text}{' '}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="font-sans text-body-sm font-semibold text-white/70"
          >
            menos
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <p
        ref={paragraphRef}
        className="select-none line-clamp-2 font-sans text-body-sm text-white drop-shadow"
      >
        {text}
      </p>
      {clamped && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          // Fade curto na mesma cor do gradiente do card (transparente→escuro),
          // só para "encaixar" o "… mais" no fim da 2ª linha sem virar um card.
          className="absolute bottom-0 right-0 pl-8 font-sans text-body-sm font-semibold text-white drop-shadow [background:linear-gradient(to_right,transparent,rgba(0,0,0,0.6)_45%)]"
        >
          … mais
        </button>
      )}
    </div>
  );
}
