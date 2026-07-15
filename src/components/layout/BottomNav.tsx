import { NavLink } from 'react-router-dom';
import { Home, Compass, ShoppingBag, Activity, CircleUserRound } from 'lucide-react';
import { clsx } from 'clsx';

const items = [
  { to: '/feed', label: 'Início', icon: Home },
  { to: '/explorar', label: 'Explorar', icon: Compass },
  { to: '/meu-fit', label: 'Meu Fit', icon: Activity, featured: true },
  { to: '/produtos', label: 'Produtos', icon: ShoppingBag },
  { to: '/perfil', label: 'Perfil', icon: CircleUserRound },
];

export function BottomNav() {
  return (
    <nav
      className="relative isolate z-[var(--z-nav)] flex shrink-0 items-stretch justify-around border-t border-outline-variant/40 bg-surface-container-lowest/95 pb-safe-bottom backdrop-blur-md"
      aria-label="Navegação principal"
    >
      {items.map(({ to, label, icon: Icon, featured }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex min-h-[52px] flex-1 flex-col items-center justify-center transition-colors',
              featured && 'relative z-[var(--z-nav-featured)]',
              featured ? 'gap-0.5 py-0.5' : 'gap-0.5 py-1.5',
              isActive ? 'text-on-surface' : 'text-on-surface-variant',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={clsx(
                  'flex items-center justify-center transition-all',
                  featured &&
                    'relative z-[var(--z-nav-featured)] -translate-y-2 rounded-full border border-primary/40 bg-surface-container-lowest text-primary ring-4 ring-primary/10',
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
