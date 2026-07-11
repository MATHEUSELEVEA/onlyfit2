import { useEffect, useMemo, useState } from 'react';

// Carrega todas as imagens de docs/imagens como URLs (Vite resolve/otimiza).
// Ordenadas pelo nome do arquivo para um encadeamento estável.
const imageModules = import.meta.glob('../../docs/imagens/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const IMAGES = Object.entries(imageModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const INTERVAL_MS = 5000;

/**
 * Slideshow de fundo em tela cheia: cada imagem aparece, permanece e some
 * em crossfade até passar por todas, repetindo em loop. A imagem ativa
 * ganha um leve zoom/pan (Ken Burns) para dar vida ao fundo.
 */
export function BackgroundSlideshow() {
  const [active, setActive] = useState(0);
  const images = useMemo(() => IMAGES, []);

  // Pré-carrega as imagens para que o crossfade nunca mostre um quadro vazio.
  useEffect(() => {
    images.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [images]);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % images.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [images.length]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" aria-hidden>
      {images.map((src, index) => (
        <div
          key={src}
          className="absolute inset-0 transition-opacity duration-[1600ms] ease-in-out"
          style={{ opacity: index === active ? 1 : 0 }}
        >
          <img
            src={src}
            alt=""
            className={
              'h-full w-full object-cover object-center ' +
              (index === active ? 'animate-kenburns' : '')
            }
            draggable={false}
          />
        </div>
      ))}

      {/* Gradiente escuro para dar legibilidade ao conteúdo e um clima premium. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/45 to-black/90" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40" />
    </div>
  );
}
