import { useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  ChevronRight,
  ShoppingBag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import { BottomSheet } from '@/components/ui/BottomSheet';

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

const OPERATION_ITEMS: MenuItem[] = [
  { label: 'Gestão', icon: Briefcase, to: null },
  { label: 'Meus negócios', icon: Building2, to: null },
];

const PERSONAL_ITEMS: MenuItem[] = [
  { label: 'Mercado', icon: ShoppingBag, to: '/mercado' },
  { label: 'Comunidade', icon: Users, to: null },
];

export function MenuDrawer({ open, onClose, isProfessional = false }: MenuDrawerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const sections: MenuSection[] = [
    ...(isProfessional ? [{ title: 'Operação', items: OPERATION_ITEMS }] : []),
    { title: 'Minha Área', items: PERSONAL_ITEMS },
  ];

  function handleSelect(item: MenuItem) {
    if (item.to) navigate(item.to);
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Navegação"
      description={
        isProfessional
          ? 'Acesso rápido para operação e área pessoal.'
          : 'Acesso rápido para sua área pessoal.'
      }
    >
      <div className="space-y-5 px-5 pb-6 pt-2">
        {sections.map((section, index) => {
          const titleId = `menu-section-${index}`;
          return (
            <section key={section.title} aria-labelledby={titleId}>
              <h3 id={titleId} className="mb-2 px-1 font-sans text-eyebrow text-on-surface-variant">
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
                      <span className="min-w-0 flex-1 truncate font-sans text-body font-medium">
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
    </BottomSheet>
  );
}
