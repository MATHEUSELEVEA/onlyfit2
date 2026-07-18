import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Tipo: standalone_workout — Treino e protocolo avulso.
// A implementar: montagem do treino/protocolo avulso e o preço.
export function StandaloneWorkoutConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.standalone_workout.stub" />;
}
