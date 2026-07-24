import type { OfferingConfigProps } from './OfferingConfigProps';
import { PhysicalProductsSettingsConfig } from './StructuredOfferingConfig';

// Tipo: physical_products — Produtos.
export function PhysicalProductsConfig(props: OfferingConfigProps) {
  return <PhysicalProductsSettingsConfig {...props} />;
}
