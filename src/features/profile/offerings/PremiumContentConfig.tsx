import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Tipo: premium_content — Conteúdo Premium do perfil.
// A implementar: planos/preços da assinatura Premium e o conteúdo exclusivo.
export function PremiumContentConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.premium_content.stub" />;
}
