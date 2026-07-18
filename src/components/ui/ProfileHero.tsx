import type { ReactNode } from 'react';

/**
 * Moldura padrão da foto de perfil — vale para o perfil próprio e para o de
 * qualquer creator. A foto aparece inteira (`object-contain`) numa moldura
 * quadrada sobre o borrão da própria imagem, então nenhum enquadramento é
 * cortado. `children` recebe os controles que flutuam sobre a imagem.
 */
export function ProfileHero({
  avatarUrl,
  displayName,
  initial,
  children,
}: {
  avatarUrl: string | null;
  displayName: string;
  initial: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative h-[clamp(360px,96vw,500px)] w-full overflow-hidden bg-surface-container-lowest">
      {avatarUrl ? (
        <>
          <img
            src={avatarUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-55 blur-2xl"
          />
          <div aria-hidden className="absolute inset-0 bg-surface-container-lowest/45" />
          <div className="absolute inset-x-4 bottom-0 top-[72px] flex items-end justify-center sm:inset-x-8">
            <div className="aspect-square h-full max-h-full max-w-full overflow-hidden rounded-3xl bg-surface-container-low">
              <img
                src={avatarUrl}
                alt={`Foto de ${displayName}`}
                className="h-full w-full object-contain object-bottom"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-surface-tint">
          <span className="font-sans text-display text-on-primary">{initial}</span>
        </div>
      )}

      {/* Legibilidade dos controles flutuantes no topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/55 to-transparent"
      />
      {/* A imagem termina em fade antes do nome */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
      />

      {children}
    </div>
  );
}
