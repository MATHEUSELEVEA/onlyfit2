import type { ComponentType } from 'react';
import type { OfferingConfigProps } from './OfferingConfigProps';
import { PremiumContentConfig } from './PremiumContentConfig';
import { HealthConsultancyConfig } from './HealthConsultancyConfig';
import { StandaloneWorkoutConfig } from './StandaloneWorkoutConfig';
import { StandaloneDietConfig } from './StandaloneDietConfig';
import { PhysicalProductsConfig } from './PhysicalProductsConfig';
import { GenericOfferingConfig } from './GenericOfferingConfig';

export type { OfferingConfigProps } from './OfferingConfigProps';

// Registro slug (offering_types.slug) → tela de configuração. Adicionar um novo
// tipo é: criar o componente ao lado e mapeá-lo aqui. Slug desconhecido cai no
// genérico em vez de quebrar a página.
const REGISTRY: Record<string, ComponentType<OfferingConfigProps>> = {
  premium_content: PremiumContentConfig,
  health_consultancy: HealthConsultancyConfig,
  standalone_workout: StandaloneWorkoutConfig,
  standalone_diet: StandaloneDietConfig,
  physical_products: PhysicalProductsConfig,
};

// Renderiza a configuração específica do tipo da oferta.
export function OfferingConfig({ offering, type }: OfferingConfigProps) {
  const Config = REGISTRY[offering.offering_type] ?? GenericOfferingConfig;
  return <Config offering={offering} type={type} />;
}
