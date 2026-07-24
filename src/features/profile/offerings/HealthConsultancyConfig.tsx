import type { OfferingConfigProps } from './OfferingConfigProps';
import { HealthConsultancySettingsConfig } from './StructuredOfferingConfig';

// Tipo: health_consultancy — Consultoria de saúde.
export function HealthConsultancyConfig(props: OfferingConfigProps) {
  return <HealthConsultancySettingsConfig {...props} />;
}
