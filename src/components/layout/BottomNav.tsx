import { NavLink } from 'react-router-dom';
import { Home, Compass, Dumbbell, ShoppingBag, CircleUserRound } from 'lucide-react';
import { clsx } from 'clsx';

const items = [
  { to: '/feed', label: 'Início', icon: Home },
  { to: '/explorar', label: 'Explorar', icon: Compass },
  { to: '/treino', label: 'Treino', icon: Dumbbell },
  { to: '/produtos', label: 'Biblioteca', icon: ShoppingBag },
  { to: '/perfil', label: 'Perfil', icon: CircleUserRound },
];

export function BottomNav() {
  return (
    <nav
      className="z-50 flex shrink-0 items-stretch justify-around border-t border-outline-variant/40 bg-surface-container-lowest/95 pb-safe-bottom backdrop-blur-md"
      aria-label="Navegação principal"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors',
              isActive ? 'text-on-surface' : 'text-on-surface-variant',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden />
              <span className="font-sans text-nav">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
