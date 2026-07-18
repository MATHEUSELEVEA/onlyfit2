import { Crown, Dumbbell, HeartPulse, ShoppingBag, Sparkles, Utensils } from 'lucide-react';
import type { OfferingStatus } from '../useBusinessOfferings';

// O catálogo (offering_types) guarda o nome do ícone lucide; tipos futuros sem
// mapeamento caem no genérico em vez de quebrar a UI.
const OFFERING_ICONS: Record<string, typeof Sparkles> = {
  crown: Crown,
  'heart-pulse': HeartPulse,
  dumbbell: Dumbbell,
  utensils: Utensils,
  'shopping-bag': ShoppingBag,
};

export function offeringIcon(icon: string | null) {
  return (icon && OFFERING_ICONS[icon]) || Sparkles;
}

export const STATUS_STYLES: Record<Exclude<OfferingStatus, 'archived'>, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  active: 'bg-primary-container text-on-primary-container',
  paused: 'bg-tertiary-container text-on-tertiary-container',
};

export const STATUS_LABEL_KEYS = {
  draft: 'profile.business.offers.status.draft',
  active: 'profile.business.offers.status.active',
  paused: 'profile.business.offers.status.paused',
  archived: 'profile.business.offers.status.draft',
} as const;
