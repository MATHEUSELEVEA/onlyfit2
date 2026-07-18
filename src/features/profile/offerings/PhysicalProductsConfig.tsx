import { ConfigScaffold } from './ConfigScaffold';
import type { OfferingConfigProps } from './OfferingConfigProps';

// Tipo: physical_products — Produtos.
// A implementar: cadastro de produtos, estoque, preços e entrega.
export function PhysicalProductsConfig(_props: OfferingConfigProps) {
  return <ConfigScaffold stubKey="profile.business.offers.type.physical_products.stub" />;
}
