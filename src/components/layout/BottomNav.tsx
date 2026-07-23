import { NavLink, useLocation } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Activity, CircleUserRound } from 'lucide-react';
import { clsx } from 'clsx';
import { HOME_RETAP_EVENT } from '@/lib/navigationEvents';

const items = [
  { to: '/feed', label: 'Início', icon: Home },
  { to: '/explorar', label: 'Explorar', icon: Compass },
  { to: '/meu-fit', label: 'My Fit', icon: Activity, featured: true },
  { to: '/produtos', label: 'Mercado', icon: ShoppingBag },
  { to: '/perfil', label: 'Perfil', icon: CircleUserRound },
];

interface BottomNavProps {
  // No feed a nav é translúcida sobre a mídia (estilo TikTok): fundo escuro
  // com blur e itens em branco, para o vídeo passar por trás.
  immersive?: boolean;
}

export function BottomNav({ immersive = false }: BottomNavProps) {
  const { pathname } = useLocation();

  return (
    <nav
      className={clsx(
        'relative isolate z-[var(--z-nav)] flex shrink-0 items-stretch justify-around pb-safe-bottom backdrop-blur-md',
        immersive
          ? 'bg-black/35'
          : 'border-t border-outline-variant/40 bg-surface-container-lowest/95',
      )}
      aria-label="Navegação principal"
    >
      {items.map(({ to, label, icon: Icon, featured }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => {
            if (to === '/feed' && pathname === '/feed') {
              window.dispatchEvent(new Event(HOME_RETAP_EVENT));
            }
          }}
          className={({ isActive }) =>
            clsx(
              'flex min-h-[52px] flex-1 flex-col items-center justify-center transition-colors',
              featured && 'relative z-[var(--z-nav-featured)]',
              featured ? 'gap-0.5 py-0.5' : 'gap-0.5 py-1.5',
              immersive
                ? isActive
                  ? 'text-white'
                  : 'text-white/60'
                : isActive
                  ? 'text-on-surface'
                  : 'text-on-surface-variant',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={clsx(
                  'flex items-center justify-center transition-all',
                  featured &&
                    'relative z-[var(--z-nav-featured)] -translate-y-2 rounded-full border border-primary/40 text-primary ring-4 ring-primary/10',
                  featured && (immersive ? 'bg-black/40' : 'bg-surface-container-lowest'),
                )}
              >
                <Icon
                  size={featured ? 27 : 22}
                  strokeWidth={featured || isActive ? 2.25 : 1.75}
                  className={featured ? 'm-2.5' : undefined}
                  aria-hidden
                />
              </span>
              <span className={clsx('font-sans text-nav', featured && '-mt-2 font-medium text-primary')}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
