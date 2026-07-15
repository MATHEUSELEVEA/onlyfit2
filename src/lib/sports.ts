// Taxonomia única dos grupos de afinidade do app e do banco.
// Estes valores também são persistidos no Supabase para filtros, feed e
// descoberta.
export interface FeedSport {
  key: string;
  label: string;
}

export const FEED_SPORTS: FeedSport[] = [
  { key: 'bodybuilding', label: 'Bodybuilding' },
  { key: 'hyrox', label: 'Hyrox' },
  { key: 'lutas', label: 'Lutas' },
  { key: 'corrida', label: 'Corrida' },
  { key: 'triathlon', label: 'Triathlon' },
  { key: 'saude', label: 'Saúde' },
];

const SPORT_LABELS = new Map(FEED_SPORTS.map((sport) => [sport.key, sport.label]));

export function sportLabel(key: string): string {
  return SPORT_LABELS.get(key) ?? humanizeSportKey(key);
}

function humanizeSportKey(key: string): string {
  const clean = key.replace(/[_-]+/g, ' ').trim();
  if (!clean) return key;
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
