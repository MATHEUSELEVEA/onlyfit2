// Taxonomia de esportes/grupos de afinidade do feed.
// Chaves IGUAIS às do banco do onlyfit v1 (parâmetro p_sports da RPC
// feed_home_posts_page), para que o filtro do feed funcione de verdade.
// Ordem fixa por enquanto (etapa atual); ordenação por uso vem depois.
export interface FeedSport {
  key: string;
  label: string;
}

export const FEED_SPORTS: FeedSport[] = [
  { key: 'bodybuilding', label: 'Musculação' },
  { key: 'martial_arts', label: 'Lutas' },
  { key: 'running', label: 'Corrida' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'crossfit', label: 'CrossFit' },
  { key: 'cycling', label: 'Ciclismo' },
  { key: 'swimming', label: 'Natação' },
  { key: 'nutrition', label: 'Nutrição' },
];
