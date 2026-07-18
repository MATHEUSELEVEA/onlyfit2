import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Tipo: health_consultancy — Consultoria de saúde.
// A implementar: pacotes, agenda/disponibilidade e formato dos atendimentos.
export function HealthConsultancyConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.health_consultancy.stub" />;
}
