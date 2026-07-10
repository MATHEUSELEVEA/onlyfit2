import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  ChevronRight,
  Compass,
  Home,
  ShoppingBag,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  isProfessional?: boolean;
}

interface MenuItem {
  label: string;
  icon: LucideIcon;
  to: string | null;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const GENERAL_ITEMS: MenuItem[] = [
  { label: 'Início', icon: Home, to: '/feed' },
  { label: 'Rotina', icon: Sparkles, to: '/treino' },
];

const OPERATION_ITEMS: MenuItem[] = [
  { label: 'Gestão', icon: Briefcase, to: null },
  { label: 'Meus negócios', icon: Building2, to: null },
];

const PERSONAL_ITEMS: MenuItem[] = [
  { label: 'Explorar', icon: Compass, to: '/explorar' },
  { label: 'Market', icon: ShoppingBag, to: '/produtos' },
  { label: 'Comunidade', icon: Users, to: null },
];

export function MenuDrawer({ open, onClose, isProfessional = false }: MenuDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections: MenuSection[] = [
    { title: 'Geral', items: GENERAL_ITEMS },
    ...(isProfessional ? [{ title: 'Operação', items: OPERATION_ITEMS }] : []),
    { title: 'Minha Área', items: PERSONAL_ITEMS },
  ];

  function handleSelect(item: MenuItem) {
    if (item.to) navigate(item.to);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar menu"
        className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-labelledby="navigation-title"
        aria-describedby="navigation-description"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-[88%] overflow-y-auto rounded-t-2xl border-t border-outline-variant/30 bg-background pb-safe-bottom shadow-2xl"
      >
        <div className="sticky top-0 z-10 bg-background px-5 pb-2 pt-3">
          <div className="flex justify-center">
            <span className="h-1 w-10 rounded-full bg-outline-variant" aria-hidden />
          </div>
          <h2 id="navigation-title" className="mt-4 text-lg font-bold text-on-surface">
            Navegação
          </h2>
          <p id="navigation-description" className="mt-1 text-xs text-on-surface-variant">
            {isProfessional
              ? 'Acesso rápido para operação e área pessoal.'
              : 'Acesso rápido para sua rotina e área pessoal.'}
          </p>
        </div>

        <div className="space-y-5 px-5 pb-6 pt-2">
          {sections.map((section, index) => {
            const titleId = `menu-section-${index}`;
            return (
              <section key={section.title} aria-labelledby={titleId}>
                <h3
                  id={titleId}
                  className="mb-2 px-1 text-xs font-medium text-on-surface-variant"
                >
                  {section.title}
                </h3>
                <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface/40">
                  {section.items.map((item) => {
                    const active = item.to !== null && location.pathname === item.to;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={clsx(
                          'flex min-h-12 w-full items-center gap-3 border-b border-outline-variant/20 px-3 py-2.5 text-left last:border-b-0 active:bg-surface-container',
                          active ? 'bg-primary/10 text-primary' : 'text-on-surface',
                        )}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                          <Icon
                            size={18}
                            strokeWidth={active ? 2.35 : 1.9}
                            className={active ? 'text-primary' : 'text-on-surface-variant'}
                            aria-hidden
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {item.label}
                        </span>
                        <ChevronRight size={17} className="shrink-0 text-outline" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
