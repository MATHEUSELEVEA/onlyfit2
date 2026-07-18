import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Fallback para tipos de oferta ainda sem tela dedicada (o catálogo
// offering_types pode ganhar tipos novos por INSERT no banco, sem código aqui).
export function GenericOfferingConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.generic.stub" />;
}
