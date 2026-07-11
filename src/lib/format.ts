// Contadores compactos no padrão de rede social (1.2K, 3M).
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(value);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Preço no padrão do marketplace: R$ 0 (ou nulo) vira "Grátis"; o criador
// pode cobrar ou liberar de graça qualquer produto, desafio ou comunidade.
export function formatPrice(value: number | null | undefined): string {
  if (!value || value <= 0) return 'Grátis';
  return brl.format(value);
}
