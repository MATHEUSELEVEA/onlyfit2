import type { BusinessOffering, OfferingType } from '../useBusinessOfferings';

// Contrato que toda tela de configuração por tipo de oferta recebe. Cada tipo
// terá o próprio corpo (planos, agenda, itens, estoque…) construído em fases
// futuras; por ora todas usam o mesmo scaffold. Manter o offering/type aqui
// deixa o ponto de extensão pronto sem mexer no dispatcher depois.
export interface OfferingConfigProps {
  offering: BusinessOffering;
  type: OfferingType | null;
}
