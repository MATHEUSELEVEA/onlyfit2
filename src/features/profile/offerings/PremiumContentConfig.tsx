import type { OfferingConfigProps } from './OfferingConfigProps';
import { PremiumContentSettingsConfig } from './StructuredOfferingConfig';

// Tipo: premium_content — Conteúdo Premium do perfil.
export function PremiumContentConfig(props: OfferingConfigProps) {
  return <PremiumContentSettingsConfig {...props} />;
}
