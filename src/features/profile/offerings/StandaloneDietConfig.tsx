import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Tipo: standalone_diet — Dieta avulsa.
// A implementar: montagem da dieta avulsa e o preço.
export function StandaloneDietConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.standalone_diet.stub" />;
}
